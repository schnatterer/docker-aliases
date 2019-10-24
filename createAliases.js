const exec = require('child-process-promise').exec;

let predefinedDockerCommandAbbrevs = {
    b: {cmd: 'build'},
    c: {cmd: 'container'},
    ex: {cmd: 'exec'},
    img: {cmd: 'image'},
    imgs: {cmd: 'images'},
    l: {cmd: 'logs'},
    r: {cmd: 'run'},
    t: {cmd: 'tag'},
    sta: {cmd: 'start'},
    v: {cmd: 'volume'}
};

main();

function main() {
    // TODO apply a lot of clean code here

    // TODO podman

    exec("DOCKER_CLI_EXPERIMENTAL=enabled docker --help | grep -e '^  [a-z]' | sed 's/  \\(\\w*\\).*/\\1/'")
        .then(result => {
            const commandList = result.stdout.split(/\r?\n/);
            // TODO cli var for skipping opinionated predefined aliases
            let commands = makeUniqueCommandAbbrevs(commandList, predefinedDockerCommandAbbrevs);

            // TODO make the whole thing recursive starting on top level?
            let promises = [];
            commands.forEach(command => {
                promises.push(parseCommand(command));
            });
            return Promise.all(promises);
        })
        .then(commandAliases => printAliases(commandAliases))
        .catch(err => {
            console.error(err);
            process.exit(1)
        })
}

function parseCommand(command) {
    // Don't fail when grep does not return a result - some commands don't have params
    return exec(`DOCKER_CLI_EXPERIMENTAL=enabled docker ${command.cmd} --help`)
        .then(result2 => {
            let result = {};
            let subCommands = result2.stdout.split(/\r?\n/);
            let nextSubCommands = findSubCommands(subCommands);
            // Typically we have either subcommands or args in docker CLI
            // TODO This seems not to be true for all commands - see e.g. "docker stacks --help"
            // How to handle? Implement both?
            if (nextSubCommands.length === 0) {
                let params = findParams(subCommands);
                result[command.abbrev] = command.cmd;

                // TODO How to handle parameters?
                //  All permutations, i.e. all parameters in all orders are way to many!
                // e.g. docker run -diPt
                // dridPt dritdP dri ...
                //const permutations = createPermutations(params);
                //permutations.forEach(permutation => {
                // TODO don't print put in map
                //console.log(`alias d${command.abbrev}${permutation}='docker ${command.cmd} -${permutation}'`);
                //});
            } else {
                // TODO can we make this globally unique?
                let nextSubCommandsAbbrevs = makeUniqueCommandAbbrevs(nextSubCommands, {});
                nextSubCommandsAbbrevs.forEach(subCommand => {
                    result[`${command.abbrev}${subCommand.abbrev}`] = `${command.cmd} ${subCommand.cmd}`
                });
                result[command.abbrev] = command.cmd;
                // TODO recurse subcommands
            }
            return result
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

function makeUniqueCommandAbbrevs(commands, predefined) {

    const abbrevs = predefined;
    const conflicts = [];
    for (const abbrev in abbrevs) {
        abbrevs[abbrev].predefined = true;
        abbrevs[abbrev]['abbrev'] = abbrev;

        // Remove predefined
        const index = commands.indexOf(abbrevs[abbrev].cmd);
        if (index !== -1) commands.splice(index, 1);
    }

    // Sort commands in order to have shorter versions first. Otherwise this might fail ['signer', 'sign']
    commands.sort();
    commands.forEach(command => {
        command = command.trim();
        if (!command) {
            // Empty newline might be among the "commands"
            return;
        }
        let competingCommand;
        for (let i = 0; i < command.length + 1; i++) {
            // Run to length+1 to make this sanity check
            if (i === command.length) {
                throw `No matching abbreviation found for command: ${command}`
            }
            let potentialAbbrev = command.substring(0, i + 1);
            if (!competingCommand) {
                competingCommand = abbrevs[potentialAbbrev];
                if (!competingCommand) {
                    if (!conflicts.includes(potentialAbbrev) ||
                        // Last char of this command. Pick it even though there are conflicts.
                        //Example: "builds" & "builder" are processed. Then "build" is processed.
                        i === command.length - 1) {
                        abbrevs[potentialAbbrev] = {cmd: command, abbrev: potentialAbbrev};
                        break
                    }
                } else {
                    if (!competingCommand.predefined) {
                        conflicts.push(potentialAbbrev);
                        delete abbrevs[potentialAbbrev]
                    } else {
                        competingCommand = undefined
                    }
                }
            } else {
                if (competingCommand.cmd.charAt(i)) {
                    const competingAbbrev = competingCommand.cmd.substring(0, i + 1);
                    if (competingAbbrev === potentialAbbrev) {
                        // Conflict persists
                        conflicts.push(potentialAbbrev);
                    } else {
                        if (!conflicts.includes(potentialAbbrev)) {
                            // We have found a compromise
                            abbrevs[potentialAbbrev] = {cmd: command, abbrev: potentialAbbrev};
                            competingCommand.abbrev = competingAbbrev;
                            abbrevs[competingAbbrev] = competingCommand;
                            break
                        }
                    }
                } else {
                    // competing command is shorter, it gets the shorter abbrev
                    let shorterAbbrev = potentialAbbrev.substring(0, i);
                    // SKip removing the conflict, it doesnt matter
                    abbrevs[shorterAbbrev] = competingCommand;
                    abbrevs[potentialAbbrev] = {cmd: command, abbrev: potentialAbbrev};
                    break;
                }
            }
        }
    });
    return sortObjectToArray(abbrevs)
}

function sortObjectToArray(o) {
    var sorted = [],
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

function findSubCommands(commands) {
    let subCommandLines = [];
    let afterCommandsLine = false;
    commands.forEach(commandLine => {
        if (afterCommandsLine &&
            // Get rid of empty lines
            commandLine &&
            // Commands and params are indented, get rid of all other texts
            commandLine.startsWith('  ')) {
            subCommandLines.push(commandLine)
        } else if (commandLine.startsWith('Commands:') ||
                   commandLine.startsWith('Management Commands:')) {
            afterCommandsLine = true
        }
    });
    let subCommands = subCommandLines.map(subCommand => subCommand.replace(/ *(\w*) .*/, "$1").trim());
    return subCommands;
}

function findParams(commands) {
    // Match only boolean args (for now) - maybe in future: find also non-booleans and create one permutation for each with this params at the end?
    //let params = commands.filter(command => /--[^ ]*  /.test(command));
    // Match only boolean args with a single param (for now) - maybe in future find a way to support, e.g. --rm as well
    let params = commands.filter(command => /^ *-\w,/.test(command));
    let abbrevs = params.map(param => param.replace(/-(\w).*/, "$1").trim());
    return abbrevs;
}

function printAliases(commandAliases) {
    // TODO check duplicates, fail if duplicates!
    // TODO sort alphabetically?
    let nAliases = 0;
    commandAliases.forEach(aliases => {
        Object.keys(aliases).forEach(abbrev => {
            console.log(`alias d${abbrev}='docker ${aliases[abbrev]}'`);
            nAliases++;
        });
    });
    // Print to stderr in order to allow for piping stdout to aliases file
    console.error(`Created ${nAliases} aliases`)
}