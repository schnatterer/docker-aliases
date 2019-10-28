const exec = require('child-process-promise').exec;

// TODO provide CLI option for overriding (e.g. for podman) and use throughout app
const envVars = 'DOCKER_CLI_EXPERIMENTAL=enabled';
const binary = 'docker';
const binaryAbbrev = binary.charAt(0);

// TODO cli var for skipping opinionated predefined aliases
// Note that binary is added to abbrev an command automatically
// e.g. b : build -> db : docker build
// This contains a couple of commands that result in shorter abbreviations.
// Why? The algorithm creates compromises, e.g. stop vs. start results in dsto and dsta, no one get ds or dst
// These predefineds are pretty much opinionated, trying to create shorter abbrevs for commands that are used more often
// TODO use the same abbrevs also in nested commands, i.e. svc for docker services and docker stack services
let predefinedAbbrevs = {
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
    v: 'volume'
};

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
    Object.keys(predefinedAbbrevs).forEach(abbrev => {
        prepended[`${binaryAbbrev}${abbrev}`] = `${binary} ${predefinedAbbrevs[abbrev]}`
    });
    return prepended;
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

function createPermutations(array) {
    let ret = [];

    for (let i = 0; i < array.length; i = i + 1) {
        let rest = createPermutations(array.slice(0, i).concat(array.slice(i + 1)));

        if (!rest.length) {
            ret.push(array[i])
        } else {
            for (let j = 0; j < rest.length; j = j + 1) {
                ret.push(array[i] + rest[j])
            }
        }
    }
    return ret;
}

function createAbbrevs(commands, predefined) {

    // TODO How to handle parameters?
    //  All permutations, i.e. all parameters in all orders are way to many!
    // e.g. docker run -diPt
    // dridPt dritdP dri ...
    //const permutations = createPermutations(params);
    // Only use sorted permutations, i.e. abc, ac, bc, c, b, a?
    const abbrevs = {};
    const conflicts = [];

    Object.keys(predefined).forEach(predefinedAbbrev => {
        let predefinedCommand = commands[predefined[predefinedAbbrev]];
        if (!predefinedCommand) {
            console.error(`Predefined command does not exist: ${predefined[predefinedAbbrev]}`)
        } else {
            abbrevs[predefinedAbbrev] = predefinedCommand;
            predefinedCommand.predefined = true;
            predefinedCommand.abbrev = predefinedAbbrev;
        }
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
                        // competingCommand?
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
    return sortObjectToArray(abbrevs)
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

function sortObjectToArray(o) {
    let sorted = [],
        key, a = [];

    for (key in o) {
        if (o.hasOwnProperty(key)) {
            a.push(key);
        }
    }

    a.sort();

    for (key = 0; key < a.length; key++) {
        sorted.push(o[a[key]]);
    }
    return sorted;
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
    let commands = commandLines.map(subCommand => subCommand.replace(/ *(\w-*)\** .*/, "$1").trim());
    return commands;
}

function findParams(stdoutLines) {
    // Match only boolean args (for now) - maybe in future: find also non-booleans and create one permutation for each with this params at the end?
    //let params = commands.filter(command => /--[^ ]*  /.test(command));
    // Match only boolean args with a single param (for now) - maybe in future find a way to support, e.g. --rm as well
    let params = stdoutLines.filter(stdoutLine => /^ *-\w,/.test(stdoutLine));
    let abbrevs = params.map(param => param.replace(/-(\w).*/, "$1").trim());
    return abbrevs;
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