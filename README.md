# docker-aliases
[![Build Status](https://travis-ci.org/schnatterer/docker-aliases.svg?branch=master)](https://travis-ci.org/schnatterer/docker-aliases)
[![](https://images.microbadger.com/badges/image/schnatterer/docker-aliases.svg)](https://hub.docker.com/r/schnatterer/docker-aliases)

(Semi-) automatically generated docker CLI aliases.

Heavily inspired by [oh-my-zsh git plugin](https://github.com/robbyrussell/oh-my-zsh/blob/master/plugins/git/README.md) 
and [kubectl-aliases](https://github.com/ahmetb/kubectl-aliases).

## Installation

```bash
# Create aliases with docker
docker run --rm schnatterer/docker-aliases > ~/.docker_aliases && source ~/.docker_aliases
# Alternative: Create aliases with local node and docker installation, executing script from this repo
node createAliases.js | cat > ~/.docker_aliases && source ~/.docker_aliases
# Load aliases when zsh starts
echo "[[ -f ~/.docker_aliases ]] && source ~/.docker_aliases" >> ~/.zshrc
```

Note that in the container the `Docker Inc,` sub commands `docker app` and `docker buildx` seem not to be included when
run within docker container. 

## Learning aliases

Pro tip: grep the `alias` command, e.g like so:  

```bash
alias | grep 'docker run'
```

### Parameters

* Are generally in alphabetical order, except parameters require an argument (like `docker build -t`) are always at the 
  end (otherwise the the command would not be syntactically correct)
* For now only there are only aliases containing containing at max three parameters with single character abbreviation

### Prominent examples

```bash
dpsa # docker ps -a
drit nginx # docker run -it
dexit container sh # docker exec -it container sh
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
  e.g. params `a`, `b` and `c` -> `ab`, `ac`, `bc`. Not `ba`, `ca`, etc.
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