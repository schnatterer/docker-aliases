const exec = require('child-process-promise').exec;

// TODO provide CLI option for overriding (e.g. for podman) and use throughout app
const envVars = 'DOCKER_CLI_EXPERIMENTAL=enabled';
const binary = 'docker';
const binaryAbbrev = binary.charAt(0);
// "alias d" already taken https://github.com/robbyrussell/oh-my-zsh/blob/master/lib/directories.zsh
// So use upper when only using 'D' but stick with lower for all other aliases because its faster to type
const binaryAbbrevStandalone = 'D';

//  All permutations, i.e. all parameters in all orders are way to many
//  e.g. docker run -diPt
//  dridPt dritdP dri ...
// Fist Simplification: Use alphabetical order without duplicates, e.g abc, ab, ac, bc; but not ba, cba, etct.
// This still results in about 50.000 abbrevs for shortParams only!
// So, limit number of params per command (recursion depth)
const numberOfMaxParamsPerAlias = 3;

// This contains a couple of commands that result in shorter abbreviations.
// Why? The algorithm creates compromises, e.g. stop vs. start results in dsto and dsta, no one get ds or dst
// These "predefineds" are pretty much opinionated, trying to create shorter abbrevs for commands that are frequently used
// Note that binary is added to abbrev an command automatically
// e.g. b : build -> db : docker build
// TODO use the same abbrevs also in nested commands, i.e. svc for docker services and docker stack services
let predefinedAbbrevCmds = {
    a: 'app',
    b: 'build',
    br: 'builder',
    bx: 'buildx',
    c: 'container',
    cm: 'commit',
    cf: 'config',
    cx: 'context',
    ex: 'exec',
    img: 'image',
    imgs: 'images',
    n: 'network',
    l: 'logs',
    p: 'plugin',
    ps: 'ps',
    r: 'run',
    s: 'swarm',
    se: 'search',
    svc: 'service',
    st: 'stack',
    t: 'tag',
    sta: 'start',
};

// TODO search for more with e.g.
// ➜ history| grep -E '^ *[0-9\w]*  docker ' | awk '{d = ""; for (f=2; f<=NF; ++f) {if ($f =="|") break; printf("%s%s", d, $f); d = OFS}; printf("\n") }' |sort|uniq -c|sort -rn | grep '\-' | less
// Most frequent sub commands: history| grep -E '^ *[0-9\w]*  docker ' | awk '{print $2" "$3}' |awk 'BEGIN {FS="|"} {print $1}'|sort|uniq -c|sort -rn|head -30
let predefinedAbbrevParams = {
    rrm: 'run --rm',
    rrmd: 'run --rm -d',
    rrmit: 'run --rm -it',
};

// TODO exclude aliases to exclude because they make no sense semantically. Cant be automated.
// "docker run -dit"; "docker -v with other commands"

main();

function main() {

    let commands = {};
    parseCommands('docker', undefined, commands)
        .then(() => {
            let aliases = createAbbrevs(commands, createPredefinedAbbrevs());
            printAliases(aliases)
        })
        .catch(err => {
            console.error(err);
            process.exit(1)
        })
}

function createPredefinedAbbrevs() {
    const prepended = {};
    Object.keys(predefinedAbbrevCmds).forEach(abbrev => {
        addPredefinedAbbrev(predefinedAbbrevCmds, abbrev, prepended);
    });
    Object.keys(predefinedAbbrevParams).forEach(abbrev => {
        addPredefinedAbbrev(predefinedAbbrevParams, abbrev, prepended);
    });

    return prepended;
}

function addPredefinedAbbrev(abbrevs, abbrev, prepended) {
    let prependedAbbrev = `${binaryAbbrev}${abbrev}`;
    let prependedCmdString = `${binary} ${abbrevs[abbrev]}`;
    if (prepended[prependedAbbrev]) {
        throw `Duplicate predefined abbrev: ${prependedAbbrev} - '${prepended[prependedAbbrev]}' and '${prependedCmdString}'`
    }
    prepended[prependedAbbrev] = prependedCmdString;
}

function parseCommands(command, parent, currentResult) {
    const absoluteCommand = `${parent ? `${parent.cmdString} ${command}` : command}`;
    return exec(`${envVars} ${absoluteCommand} --help`)
        .then(execOut => {
            let stdoutLines = execOut.stdout.split(/\r?\n/);
            let nextSubCommands = findCommands(stdoutLines);

            let commandObject = {cmd: command, parent: parent, cmdString: absoluteCommand};
            commandObject.subcommands = nextSubCommands;
            commandObject.params = findParams(stdoutLines);
            currentResult[absoluteCommand] = commandObject;

            if (nextSubCommands.length > 0) {
                // Recurse into subcommands
                let promises = [];
                nextSubCommands.forEach(nextSubCommand => {
                    promises.push(parseCommands(nextSubCommand, commandObject, currentResult));
                });
                return Promise.all(promises);
            } else {
                // End recursion
                return currentResult
            }
        })
}

function createAbbrevs(commands, predefined) {

    const abbrevs = {};
    const conflicts = [];

    Object.keys(predefined).forEach(predefinedAbbrev => {
        let predefinedCommand = commands[predefined[predefinedAbbrev]];
        if (!predefinedCommand) {
            // A parent is not needed for predefineds
            predefinedCommand = {cmdString: predefined[predefinedAbbrev]};
        }
        abbrevs[predefinedAbbrev] = predefinedCommand;
        predefinedCommand.predefined = true;
        predefinedCommand.abbrev = predefinedAbbrev;
    });

    // Sort commands in order to have shorter versions first. Otherwise this might fail ['signer', 'sign']
    Object.keys(commands).sort().forEach(absoluteCommand => {
        let commandObj = commands[absoluteCommand];
        if (commandObj.predefined) {
            return
        }
        const currentSubCommand = commandObj.cmd;
        let competingCommand;
        for (let i = 0; i < currentSubCommand.length + 1; i++) {
            // Run to length+1 for sanity checking
            if (i === currentSubCommand.length) {
                throw `No matching abbreviation found for command: ${absoluteCommand}`
            }
            const parentAbbrev = commandObj.parent ? commandObj.parent.abbrev : '';
            let potentialAbbrev = `${parentAbbrev}${currentSubCommand.substring(0, i + 1)}`;
            if (!competingCommand) {
                competingCommand = abbrevs[potentialAbbrev];
                if (!competingCommand) {
                    if (!conflicts.includes(potentialAbbrev) ||
                        // Last char of this command. Pick it even though there are conflicts.
                        //Example: "builds" & "builder" are processed. Then "build" is processed.
                        i === currentSubCommand.length - 1) {
                        setAbbrev(abbrevs, potentialAbbrev, commandObj);
                        break
                    }
                } else {
                    if (!competingCommand.predefined) {
                        conflicts.push(potentialAbbrev);
                        delete abbrevs[potentialAbbrev];
                        delete commandObj.abbrev
                        // TODO what to do if i === currentSubCommand.length - 1?
                        // This will result in "No matching abbreviation found"
                        // But just setting to competingCommand is not possible because what would be the abbrev for
                        // competingCommand? Create a list of subcommands that need to be moved after this loop?
                        // Could also be used for params.
                    } else {
                        competingCommand = undefined
                    }
                }
            } else {
                if (competingCommand.cmdString.charAt(i)) {
                    const competingParentAbbrev = competingCommand.parent ? competingCommand.parent.abbrev : '';
                    const competingAbbrev = `${competingParentAbbrev}${competingCommand.cmd.substring(0, i + 1)}`;
                    if (competingAbbrev === potentialAbbrev) {
                        // Conflict persists
                        conflicts.push(potentialAbbrev);
                    } else {
                        if (!conflicts.includes(potentialAbbrev)) {
                            // We have found a compromise
                            setAbbrev(abbrevs, potentialAbbrev, commandObj);
                            updateAbbrev(abbrevs, competingAbbrev, competingCommand, commands);
                            break
                        }
                    }
                } else {
                    // competing command is shorter, it gets the shorter abbrev
                    let shorterAbbrev = potentialAbbrev.substring(0, i);
                    // Skip removing the conflict, it doesnt matter
                    setAbbrev(abbrevs, potentialAbbrev, commandObj);
                    updateAbbrev(abbrevs, shorterAbbrev, competingCommand, commands);
                    break;
                }
            }
        }
    });
    addParamAbbrevs(abbrevs);
    changeBinaryAbbrevStandalone(abbrevs);
    // Sorting by cmd instead of abbrev make comparing alias results easier after changes
    return sortByCmdStringToArray(abbrevs)
}

function changeBinaryAbbrevStandalone(abbrevs) {
    abbrevs[binaryAbbrevStandalone] = abbrevs[binaryAbbrev];
    delete abbrevs[binaryAbbrev];
    abbrevs[binaryAbbrevStandalone].abbrev = binaryAbbrevStandalone;
}

function addParamAbbrevs(abbrevs) {

    // Add params after the commands' abbrevs have been created.
    // That is, commands' aliases take precedence.

    let potentialParamAbbrevs = [];
    Object.keys(abbrevs).sort().forEach(abbrev => {
        const abbrevObj = abbrevs[abbrev];
        createPotentialParamAbbrevs(abbrevObj, abbrevObj.params, potentialParamAbbrevs)
    });
    addValidParamAbbrevs(abbrevs, potentialParamAbbrevs);
}

function createPotentialParamAbbrevs(cmd, params, paramAbbrevs = [], previousParams = []) {

    if (params && previousParams.length <= numberOfMaxParamsPerAlias - 1) {
        params.forEach(param => {

            // Maybe in future find a way to support long params, e.g. --rm as well
            // TODO Idea: Use long params with up to 2 or 3 chars?
            // What about sort order? E.g. plain alphabetical would be harder to remember
            // e.g. 'docker run -it --rm' - 'drirmt' unintuitive?! 'dritrm' would be easier but 'drrmit' would more fun in this case :D
            // Maybe short parms first? Or Last? Implement in addValidParamAbbrevs()

            // TODO Further idea: add abbrevs for sub commands. e.g. --entrypoint -> ep
            if (param.shortParam) {
                paramAbbrevs.push({cmd: cmd, params: previousParams.concat(param)});
                // Recurse into all other parameters, that follow alphabetically after this one
                let allParamsAfterThisOne = cmd.params.slice(cmd.params.indexOf(param) + 1);
                createPotentialParamAbbrevs(cmd, allParamsAfterThisOne, paramAbbrevs, previousParams.concat(param))
            }
        });
    }
}

function addValidParamAbbrevs(abbrevs, potentialParamAbbrev) {
    potentialParamAbbrev.forEach(paramToAbbrev => {

        const nonBooleanParams = paramToAbbrev.params.filter(param => param.arg);
        if (nonBooleanParams.length > 1) {
            // This combination of param is invalid for an alias, as there are is more than on param requiring an arg
            return
        }
        const nonBooleanParam = nonBooleanParams.length > 0 ? nonBooleanParams[0] : undefined;

        let paramAbbrev = paramToAbbrev.cmd.abbrev;
        let paramCmdString = `${paramToAbbrev.cmd.cmdString} -`;
        paramToAbbrev.params.forEach(param => {
            if (param === nonBooleanParam) {
                // Param that expects an argument must be at the end
                return
            }
            paramAbbrev += param.shortParam;
            paramCmdString += param.shortParam;
        });

        if (nonBooleanParam) {
            paramAbbrev += nonBooleanParam.shortParam;
            paramCmdString += nonBooleanParam.shortParam;
        }

        if (abbrevs[paramAbbrev]) {
            // TODO how to handle those?
            console.error(`Parameter results in duplicate abbrev - ignoring: alias ${paramAbbrev}='${paramCmdString}' - conflicts with alias ${abbrevs[paramAbbrev].abbrev}='${abbrevs[paramAbbrev].cmdString}'`)
        } else {
            abbrevs[paramAbbrev] = {parent: paramToAbbrev.cmd, abbrev: paramAbbrev, cmdString: paramCmdString};
        }
    });
}

function updateAbbrev(abbrevs, abbrev, commandObj, commands) {
    commandObj.subcommands.forEach(subCommand => {
        const subCommandObj = commands[`${commandObj.cmdString} ${subCommand}`];
        if (!subCommandObj.abbrev) {
            console.error(`Subcommand does not have abbrev while updating: ${subCommandObj.cmdString}`)
        } else {
            delete abbrevs[subCommandObj.abbrev];
            const newSubCommandAbbrev = subCommandObj.abbrev.replace(new RegExp(`^${commandObj.abbrev}`), abbrev);
            updateAbbrev(abbrevs, newSubCommandAbbrev, subCommandObj, commands)
        }
    });
    abbrevs[abbrev] = commandObj;
    commandObj.abbrev = abbrev;
}

function setAbbrev(abbrevs, abbrev, commandObj) {
    if (abbrevs[abbrev]) {
        console.error(`Duplicates for abbrev ${abbrev}! ${abbrevs[abbrev].cmdString} & ${commandObj.cmdString} `)
    }
    commandObj.abbrev = abbrev;
    abbrevs[abbrev] = commandObj;
}

function sortByCmdStringToArray(abbrevs) {
    return Object.values(abbrevs).sort((a, b) => {
        if (a.cmdString < b.cmdString) {
            return -1;
        }
        if (a.cmdString > b.cmdString) {
            return 1;
        }
        return 0;
    });
}

function findCommands(stdoutLines) {
    let commandLines = [];
    let afterCommandsLine = false;
    stdoutLines.forEach(stdOutLine => {
        if (afterCommandsLine &&
            // Get rid of empty lines
            stdOutLine &&
            // Commands and params are indented, get rid of all other texts
            stdOutLine.startsWith('  ')) {
            commandLines.push(stdOutLine)
        } else if (stdOutLine.startsWith('Commands:') ||
            stdOutLine.startsWith('Management Commands:')) {
            afterCommandsLine = true
        }
    });
    return commandLines.map(subCommand => subCommand.replace(/ *(\w-*)\** .*/, "$1").trim());
}

function findParams(stdoutLines) {
    let params = stdoutLines.filter(stdoutLine => /^ +-{1,2}\w*/.test(stdoutLine));
    let paramObjs = params.map(param => {
        const matchesShortParam = /-(\w), --([\w-]*) (\w*).*/.exec(param);
        if (matchesShortParam === null) {
            const matchesLongParam = /--([\w-]*) (\w*).*/.exec(param);
            if (matchesLongParam === null) {
                throw `Param parsing failed for param: ${param}`;
            }
            return {longParam: matchesLongParam[1], arg: matchesLongParam[2]}
        } else {
            return {shortParam: matchesShortParam[1], longParam: matchesShortParam[2], arg: matchesShortParam[3]}
        }
    });
    // Sort alphabetically to get defined order
    return paramObjs.sort((a, b) => {
        if (a.longParam < b.longParam) {
            return -1;
        }
        if (a.longParam > b.longParam) {
            return 1;
        }
        return 0;
    })
}

function printAliases(commandAliases) {
    let nAliases = 0;
    commandAliases.forEach(cmd => {
        console.log(`alias ${cmd.abbrev}='${cmd.cmdString}'`);
        nAliases++;
    });

    // Print to stderr in order to allow for piping stdout to aliases file
    console.error(`Created ${nAliases} aliases.`)
}