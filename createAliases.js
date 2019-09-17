const exec = require('child-process-promise').exec;

main();

function main() {
    let nAliases = 0;

    // TODO apply a lot of clean code here
    exec("docker --help | grep -e '^  [a-z]' | sed 's/  \\(\\w*\\).*/\\1/'")
        .then(result => {
            let commands = result.stdout.split(/\r?\n/);
            // TODO make the whole thing recursive starting on top level?
            let promises = [];
            commands.forEach(command => {
                command = command.trim();
                // TODO properly abbreviate command, using more chars for duplicates
                // And use only the most common ones /docker login vs logout vs logs -> dl for logs dlogi, dlogo
                const abbrevCommand = command.charAt(0);
                // Find all subcommands or args
                promises.push(
                    // Don't fail when grep does not return a result - some commands don't have params
                    exec(`docker ${command} --help | grep -e '^  ' || true`)
                        .then(result2 => {
                            let subCommands = result2.stdout.split(/\r?\n/);
                            let nextSubCommands = findSubCommands(subCommands);
                            // Typically we have either subcommands or args in docker CLI
                            // TODO validate this!
                            if (nextSubCommands.length === 0) {
                                let params = findParams(subCommands);
                                if (params.length === 0) {
                                    console.log(`alias d${abbrevCommand}='docker ${command}'`);
                                }
                                // TODO Create all permutations: all parameters in all orders
                                // e.g. docker run -diPt
                                // dridPt dritdP dri
                                params.forEach(outerParam => {
                                    console.log(`alias d${abbrevCommand}${outerParam}='docker ${command} -${outerParam}'`);
                                    nAliases++;
                                    params.forEach(innerParam => {
                                        if (outerParam !== innerParam) {
                                            // TODO don't print put in map and check duplicates, fail if duplicates!
                                            console.log(`alias d${abbrevCommand}${outerParam}${innerParam}='docker ${command} -${outerParam}${innerParam}'`);
                                            nAliases++;
                                        }
                                    })
                                })
                            }
                            // TODO return promises map
                            return []
                        })
                        .catch(err => {
                            // TODO proper error handling
                            console.error(err);
                            process.exit(1)
                        }));
            });
            return Promise.all(promises);
        })
        .catch(err => {
            console.error(err);
            process.exit(1)
        })
        .finally(() => console.log(`Created ${nAliases} aliases`));
}

function findSubCommands(command) {
    //TODO
    return [];
}

function findParams(commands) {
    // Match only boolean args (for now) - maybe in future: find also non-booleans and create one permutation for each with this params at the end?
    //let params = commands.filter(command => /--[^ ]*  /.test(command));
    // Match only boolean args with a single param (for now) - maybe in future find a way to support, e.g. --rm as well
    let params = commands.filter(command => /^ *-\w,/.test(command));
    let abbrevs = params.map(param => param.replace(/-(\w).*/, "$1").trim());
    return abbrevs;
}
