const packageJson = require('./package.json');

const exec = require('child-process-promise').exec;

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
const numberOfMaxParamsPerAlias = 4;

// Use long params (more than one char), e.g. "--rm" or "--tls" up to this string length.
// For longer params no alias is created
const numberOfCharsOfLongParamsToUseAsAlias = 2;

// This contains a couple of commands that result in shorter abbreviations.
// Why? The algorithm creates compromises, e.g. stop vs. start results in dsto and dsta, no one get ds or dst
// These "predefineds" are pretty much opinionated, trying to create shorter abbrevs for commands that are frequently used
// Note that binary is added to abbrev an command automatically
// e.g. b : build -> db : docker build
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
    l: 'pull',
    lg: 'logs',
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
const predefinedAbbrevCmdsByCommand = swapKeyValue(predefinedAbbrevCmds);


// E.g.: rrm: 'run --rm'
let predefinedAbbrevParams = {
};

const longParamAbbrevs = {
    entrypoint : 'ep'
};

// Create abbreviations for longParams containing hyphen (log-level -> ll)
// Note: this will result in about 23k aliases (numberOfMaxParamsPerAlias=4) or 10k (numberOfMaxParamsPerAlias=3)
// From less than 1k before :-o
const createAliasesForLongParamsWithHyphen = false;

// Docker implements some synonym commands, that lead to a huge number of almost redundant aliases
// As we're facing a huge number of aliases anyway we can reduce them drastically by ignoring them
// Note that the following container/image sub commands are deliberately not excluded (as they only exist as subcommand)
// - prune,
// - inspect (docker image inspect is more specific than docker inspect)
const filterLegacySubCommands = false; // docker ps, docker rmi, etc
const filterLegacySubCommandReplacements = true; // docker container ls, docker image rm, etc
const legacyCommandReplacements = {
    'container attach': 'attach',
    'container commit': 'commit',
    'container cp': 'cp',
    'container create': 'create',
    'container diff': 'diff',
    'container exec': 'exec',
    'container export': 'export',
    'container kill' : 'kill',
    'container logs' : 'logs',
    'container ls' : 'ps',
    'container pause' : 'pause',
    'container port' : 'port',
    'container rename' : 'rename',
    'container restart' : 'restart',
    'container rm' : 'rm',
    'container run' : 'run',
    'container start' : 'start',
    'container stats' : 'stats',
    'container stop' : 'stop',
    'container top' : 'top',
    'container unpause' : 'unpause',
    'container update' : 'update',
    'container wait' : 'wait',
    'image build' : 'build',
    'image history' : 'history',
    'image import' : 'import',
    'image load' : 'load',
    'image ls' : 'images',
    'image pull' : 'pull',
    'image push' : 'push',
    'image rm' : 'rmi',
    'image save' : 'save',
    'image tag' : 'tag'
};

main();

function main() {

    console.log(`# Created with docker-aliases ${packageJson.version}`);
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

function filterCommands(abbrevs) {
        Object.keys(abbrevs).sort().forEach(abbrev => {
            const abbrevObj = abbrevs[abbrev];
            let cmdWithoutBinary = abbrevObj.cmdString.replace(new RegExp(`^${binary} `), '');
            if ((filterLegacySubCommandReplacements && Object.keys(legacyCommandReplacements).includes(cmdWithoutBinary)) ||
                (filterLegacySubCommands && Object.values(legacyCommandReplacements).includes(cmdWithoutBinary)) ) {
                    console.error(`Removing command, due to filtering options: ${abbrevObj.cmdString}`);
                    delete abbrevs[abbrev];
            }
        });
}

function createCommandAbbrevs(commands, abbrevs, conflicts) {
    Object.keys(commands).sort().forEach(absoluteCommand => {
        let commandObj = commands[absoluteCommand];
        if (commandObj.predefined || abbrevs[commandObj.abbrev]) {
            return
        }
        let currentSubCommand = commandObj.cmd;
        let competingCommand;

        // Use the same abbrevs also in nested commands, i.e. svc for docker services and docker stack services
        let predefinedAbbrev = predefinedAbbrevCmdsByCommand[currentSubCommand];
        if (predefinedAbbrev) {
            commandObj.predefined = true;
            currentSubCommand = predefinedAbbrev;
            //console.error(`Using predefined command for: ${commandObj.cmdString} : ${predefinedAbbrev}`);
        }

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
                        // Example: "builds" & "builder" are processed. Then "build" is processed.
                        i === currentSubCommand.length - 1) {
                        setAbbrev(abbrevs, potentialAbbrev, commandObj);
                        break
                    }
                } else {
                    if (!competingCommand.predefined) {
                        if (i === currentSubCommand.length - 1) {
                            // Last char of this command. It has to get this abbrev or the next iteration 
                            // will result in "No matching abbreviation found".
                            // Just removing to competingCommand is not possible because the competing command 
                            // is already processed and would lose its abrrev
                            // So: Command gets abbrev and start the loop again, so competing command
                            console.error(`Removing abbrev: ${potentialAbbrev} for cmd ${competingCommand.cmdString} in favor of ${commandObj.cmdString}`);
                            removeAbbrev(abbrevs, competingCommand, commands);
                            setAbbrev(abbrevs, potentialAbbrev, commandObj);
                            return
                        } else {
                            conflicts.push(potentialAbbrev);
                            delete abbrevs[potentialAbbrev];
                            delete commandObj.abbrev
                        }
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
}

function createAbbrevs(commands, predefined) {

    const abbrevs = {};
    const conflicts = [];

    Object.keys(predefined).forEach(predefinedAbbrev => {
        let predefinedCommand = commands[predefined[predefinedAbbrev]];
        if (!predefinedCommand) {
            console.error(`Skipping predefined command, because not returned by docker CLI: ${predefined[predefinedAbbrev]}`)
            return
        }
        abbrevs[predefinedAbbrev] = predefinedCommand;
        predefinedCommand.predefined = true;
        predefinedCommand.abbrev = predefinedAbbrev;
    });

    // Use a multi pass creation here.
    // Why? An abbreviation might be changed in a later stage, e.g. because of predefinedAbbrevCmds
    // Then just unset the command that had the abbreviation and start again, so the "unset command" is processed again
    // and gets a new abbreviation.
    while (Object.keys(abbrevs).length < Object.keys(commands).length) {
        createCommandAbbrevs(commands, abbrevs, conflicts);
    }
    filterCommands(abbrevs);
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

function addLongParamAbbrev(param) {
    if (longParamAbbrevs[param.longParam]) {
        param.longParamAbbrev = longParamAbbrevs[param.longParam];
    } else if (createAliasesForLongParamsWithHyphen && param.longParam.includes('-')) {
        param.longParamAbbrev = param.longParam
            .split('-')
            .map( substring => substring[0])
            .join('')
    }
}

function createPotentialParamAbbrevs(cmd, params, paramAbbrevs = [], previousParams = []) {

    if (params && previousParams.length <= numberOfMaxParamsPerAlias - 1) {
        params.forEach(param => {

            addLongParamAbbrev(param);

            if (param.shortParam || param.longParamAbbrev ||
                param.longParam.length <= numberOfCharsOfLongParamsToUseAsAlias) {

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

        const longParamCmdString = createLongParamCmdString(paramToAbbrev, nonBooleanParam);
        const longParamsAbbrev = filterBooleanParamsToString(paramToAbbrev, nonBooleanParam,'');

        const shortParamCmdString = createShortParamCmdString(paramToAbbrev, nonBooleanParam);
        const shortParamsAbbrev = filterBooleanParamsToString(paramToAbbrev, nonBooleanParam, '', true);

        let nonBooleanCmdString = createNonBooleanCmdString(nonBooleanParam, shortParamCmdString);
        const nonBooleanParamString = nonBooleanParamToString(nonBooleanParam);

        let paramAbbrev = `${paramToAbbrev.cmd.abbrev}${longParamsAbbrev}${shortParamsAbbrev}${nonBooleanParamString}`;
        let paramCmdString = `${paramToAbbrev.cmd.cmdString}${longParamCmdString}${shortParamCmdString}${nonBooleanCmdString}`;

        if (abbrevs[paramAbbrev]) {
            // TODO how to handle those?
            console.error(`Parameter results in duplicate abbrev - ignoring: alias ${paramAbbrev}='${paramCmdString}' - conflicts with alias ${abbrevs[paramAbbrev].abbrev}='${abbrevs[paramAbbrev].cmdString}'`)
        } else {
            abbrevs[paramAbbrev] = {parent: paramToAbbrev.cmd, abbrev: paramAbbrev, cmdString: paramCmdString};
        }
    });
}

function filterBooleanParamsToString(paramToAbbrev, nonBooleanParam, joinBy, isShort = false) {
    return paramToAbbrev.params
        .filter(param => param !== nonBooleanParam && (isShort ? param.shortParam : !param.shortParam))
        .map(param => findParamProperty(param))
        .join(joinBy);
}

function findParamProperty(param) {
    if (param.shortParam) {
        return param.shortParam
    } else if (param.longParamAbbrev) {
        return param.longParamAbbrev
    } else {
        return param.longParam;
    }
}

function createLongParamCmdString(paramToAbbrev, nonBooleanParam) {
    let longParamsCmdString = filterBooleanParamsToString(paramToAbbrev, nonBooleanParam, ' --');
    if (longParamsCmdString) {
        longParamsCmdString = ` --${longParamsCmdString}`
    }
    return longParamsCmdString;
}

function createShortParamCmdString(paramToAbbrev, nonBooleanParam) {
    let shortParamsCmdString = filterBooleanParamsToString(paramToAbbrev, nonBooleanParam, '', true);
    if (shortParamsCmdString) {
        shortParamsCmdString = ` -${shortParamsCmdString}`
    }
    return shortParamsCmdString;
}

function nonBooleanParamToString(nonBooleanParam) {
    let nonBooleanParamString = '';
    if (nonBooleanParam) {
        nonBooleanParamString = findParamProperty(nonBooleanParam)
    }
    return nonBooleanParamString;
}

function createNonBooleanCmdString(nonBooleanParam, shortParamCmdString) {
    let ret = '';
    if (nonBooleanParam) {
        if (nonBooleanParam.shortParam) {
            if (!shortParamCmdString) {
                ret += ' -'
            }
            ret += nonBooleanParam.shortParam;
        } else {
            ret = ` --${nonBooleanParam.longParam}`;
        }
    }
    return ret;
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

function removeAbbrev(abbrevs, commandObj, commands) {
    commandObj.subcommands.forEach(subCommand => {
        const subCommandObj = commands[`${commandObj.cmdString} ${subCommand}`];
            delete abbrevs[subCommandObj.abbrev];
            delete subCommandObj.abbrev
            removeAbbrev(abbrevs, subCommandObj, commands)
    });
    delete abbrevs[commandObj.abbrev];
    delete commandObj.abbrev;
}

function setAbbrev(abbrevs, abbrev, commandObj) {
    if (abbrevs[abbrev]) {
        console.error(`Duplicates for abbrev ${abbrev}! ${abbrevs[abbrev].cmdString} & ${commandObj.cmdString}. Setting ${abbrev}=${commandObj.cmdString}`)
    }
    commandObj.abbrev = abbrev;
    abbrevs[abbrev] = commandObj;
}

function swapKeyValue(json) {
    let ret = {};
    for (let key in json) {
        ret[json[key]] = key;
    }
    return ret;
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