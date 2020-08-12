# docker-aliases
[![Build Status](https://travis-ci.org/schnatterer/docker-aliases.svg?branch=master)](https://travis-ci.org/schnatterer/docker-aliases)
[![](https://images.microbadger.com/badges/image/schnatterer/docker-aliases.svg)](https://hub.docker.com/r/schnatterer/docker-aliases)

(Semi-) automatically generated docker CLI aliases.

Heavily inspired by [oh-my-zsh git plugin](https://github.com/robbyrussell/oh-my-zsh/blob/master/plugins/git/README.md) 
and [kubectl-aliases](https://github.com/ahmetb/kubectl-aliases).

## Installation

```bash
DOCKER_ALIASES_VERSION=0.2.0
# Download aliases
curl -fSL "https://github.com/schnatterer/docker-aliases/releases/download/${DOCKER_ALIASES_VERSION}/default.docker-aliases" \
  > ~/.docker_aliases
# Test aliases in current shell
source "~/.docker_aliases"
# Or load aliases when zsh starts
echo '[[ -f ~/.docker_aliases ]] && source ~/.docker_aliases' >> ~/.zshrc
```
Instead of downloading you could create the aliases yourself. This also allows for configuring the alias generated 
(see [Configuring aliases](#configuring-aliases)).

```bash
# Create aliases with docker
docker run --rm schnatterer/docker-aliases:${DOCKER_ALIASES_VERSION} > ~/.docker_aliases
# Create aliases with local node and docker installation, executing script from this repo
node createAliases.js | cat > ~/.docker_aliases
```

Note that in the container the `Docker Inc,` plugins `docker app` and `docker buildx` seem not to be included when
run within docker container. 

## Learning aliases

Pro tip 1: grep the `alias` command, e.g like so:  

```bash
alias | grep 'docker run'
```

Pro tip 2: Use an alias reminder such as [MichaelAquilina/zsh-you-should-use](https://github.com/MichaelAquilina/zsh-you-should-use):

```bash
$ docker run --rm -it --entrypoint javac gcr.io/distroless/java:8
Found existing alias for "docker run --rm -it --entrypoint". You should use: "drrmitep"
```
### Prominent examples

```bash
d # docker" - Note: This might overwrite oh-my-zsh function d(). This can be configured using BINARY_ABBREV_UPPER, see bellow. See also: https://github.com/robbyrussell/oh-my-zsh/blob/master/lib/directories.zsh 
dl image # docker pull image
dp image # docker push image
dlg container # docker logs container
dpsa # docker ps -a
drit image # docker run -it image
drrmd image # docker run --rm -d image'
drrmit image sh # docker run --rm -it image sh
drrmitep sh image # docker run --rm -it --entrypoint sh image
drrmep id image # docker run --rm --entrypoint id image
dexit container sh # docker exec -it container sh
drmf container # docker rm -f container
```

### Parameters in aliases

Are implemented by the following rules

* At max 4 parameters within one alias 
* At max one non-boolean parameter per alias (must be at the end because of argument)
* Parameters without single character abbreviation (starting in `--`, e.g. `--rm`) are only contained in alias if 
  * the parameter has less than three chars
  * has a predefined abbreviation (e.g. `entrypoint` = `ep`)
  * ~~contains a hyphen (is then abbreviated `<first char><first char after hyphen`, e.g. `--log-level` = `ll`)~~   
    (can be enable in code but results in thousands of aliases)
* Order of commands and paramaters in alias
  * Commands go first (e.g. `docker run` -> `dr`)
  * Parameters without single character abbreviation go next (e.g. `--rm`),
  * followed by the single character parameters (e.g. `-i`),
  * The non-boolean parameter is always at the end  (e.g. `-v`)
    (otherwise the the command would not be syntactically correct).
  * If multiple Parameters without single character abbreviation or single char params, the order is always alphabetical,  
    i.e.  params `a`, `b` and `c` -> aliases `ab`, `ac`, `abc`, `bc`. No aliases: `ba`, `ca`, etc.  
    Otherwise there would be way to many aliases.
* Excluded aliased/"duplicated" parameters [introduced in Docker 1.13](https://www.docker.com/blog/whats-new-in-docker-1-13/) 
  in order to drastically reduce number of aliases (from 1800 to 1000 aliases at the time of implementing).  
  Favor "older" commands (e.g `docker ps`, `docker rmi`) over new ones (e.g. `docker container ls`, `docker image rm`) 
  because they are shorter (can be configured in the code, though)

## Configuring aliases

When generating aliases, they can be customized via environment variables.

Note that changing those may or may not work. Especially increasing number of params will result in more conflicts and 
even errors as the conflict handling is not perfect.

| env var | default | notes |
| ------- | ------- | ----- |
| BINARY_ABBREV_UPPER| false | Create alias for with binary with capital letter, e.g. alias docker=D. All other aliases are not affected |
| ENABLE_DOCKER_EXPERIMENTAL | true | Create aliases for experimental commands |
| FILTER_LEGACY_SUBCOMMANDS | false | Remove aliases for legacy (but shorter) sub commands such as docker ps, docker rmi, etc. |
| FILTER_LEGACY_SUBCOMMANDS_REPLACEMENTS| true | Remove aliases for newer (but longer) sub commands such as docker container ls, docker image rm, etc. |
| NUMBER_OF_MAX_PARAMS_PER_ALIAS| 4 | Maximals parameter created into one alias, e.g. 4 - docker run --rm -i -t --entrypoint  |
| NUMBER_OF_CHARS_OF_LONG_PARAMS_TO_USE_AS_ALIAS| 2 | Long params (those with `--`) are included into aliase up to this number of chars. E.g. 2: `--rm` is included `--tls` is not. |

Use them like so

* Local node: `ENABLE_DOCKER_EXPERIMENTAL=false node createAliases.js | cat > ~/.docker_aliases`
* Docker: `docker run --rm -e ENABLE_DOCKER_EXPERIMENTAL=true schnatterer/docker-aliases:${DOCKER_ALIASES_VERSION} > ~/.docker_aliases`

## Aliases missing?

* Could be because of conflicts, see TODOs at the end
* Contributions welcome, create an issue or PR.

## Contribute

Contributions welcome!

* Are there aliases missing you use often?
* What are your most used abbrevs? Is one of them missing in the aliases?
  Ask your shell history:

```bash
# Most frequent docker commands
history| grep -E '^ *[0-9\w]*  docker ' | awk '{d = ""; for (f=2; f<=NF; ++f) {if ($f =="|") break; printf("%s%s", d, $f); d = OFS}; printf("\n") }' |sort|uniq -c|sort -rn | grep '\-' | less
# Most frequent sub commands: 
history| grep -E '^ *[0-9\w]*  docker ' | awk '{print $2" "$3}' |awk 'BEGIN {FS="|"} {print $1}'|sort|uniq -c|sort -rn|head -30
``` 

## Implementation Details

The algorithm tries to create the shortest possible alias without conflicting with other commands. As it does not favor 
commands (how should it decide?) the resulting abbreviations are sometimes longer thant necessary (e.g. `image` vs 
`ìmages` results in `images` and `images`), so with some manual intervention we decide that they can be shorter.
Some commands that are used very often are manually privileged to get shorter abbreviations than others.
Very much opinionated.

### SubCommands and parameters

Parsing sub commands and creating aliases is fairly simple and results in about 200 aliases.
There already are a couple of conflicts like `di` for `docker` `import`, `image` and `docker images` that are resolved 
by the algorithm and/or predefined abbreviations.

Adding parameters per sub command is surprisingly complex, though:

* How to automatically generate useful abbreviations for longer params such as `docker --tlsverify`?
* And the worst: For which combination of parameters to create aliases?   
  * `docker run` alone has already almost 100 params - if we created aliases of for permutations of 100 params, that would be 10^157 aliases 😱
  * Let alone the potential conflicts that arise when combining the alias of one sub command with 100 param characters.
  * And who can remember an alias of 100 characters anyway?

So for now the pragmatic solution is as follows:
* Use only params that have a single char abbreviation
* Don't create all permutations of all params of each sub command, but only in alphabetical order,   
  e.g. params `a`, `b` and `c` -> `ab`, `ac`, `abc`, `bc`. Not `ba`, `ca`, etc.
* Create only aliases containing at max 3 params.  
* In addition, some parameters are defined manually that also can be longer.
* Conflicts are not resolved. Sub commands take precedence, param abbreviations conflicting with sub commands are ignored.  
  Interestingly, there are only 5 conflicts (see stderr output)

Here are some numbers (docker `19.03.4-rc1`):
* Only sub commands (no params) - 200 aliases (commit 2f844fc6)
* sub commands and at max one boolean param per alias - 500 aliases (commit 8cd17435)
* sub commands and at max two boolean param per alias (not all permutations but alphabetical) - 1000 aliases (8cd17435)

### Error handling and logging

As the result is printed on stdout, all technical output is printed on stderr. That is, info and errors. 
Don't try this at home 😬.

### Why node.js?

Dynamic typing allows for easy change of data structures. As this was implemented more exploratory as a kind of POC, the
data structures were changed quite often. See git history

### Why no unit tests (yet)

Also here: The exploratory / POC nature of development would have caused a lot of unit tests to be thrown away.
Therefore a "golden master" testing approach was more effective here:  
Create aliases, implement change, diff with previous aliases.
Once the implemented approach is proven, a lot of refactoring should be done. This time using TDD, validating against 
the golden master.

### Potential new features / ideas / TODOs

* How to properly handle parameter conflicts? 
  * For short params there is no conflict resolution.
  * In conflicts with subcommands the params could take precedence. But make all maybe 100 aliases of a subcommand longer 
    because of one param alias?  
* provide CLI options to allow for conveniently creating customized aliases
* native podman support

