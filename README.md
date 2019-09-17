# docker-aliases
[![Build Status](https://travis-ci.org/schnatterer/docker-aliases.svg?branch=master)](https://travis-ci.org/schnatterer/docker-aliases)

Programmatically generated docker client aliases. The algorithm tries to create the shortest possible
alias without conflicting with other commands.
Example:

Some commands that are used very often are manually privileged to get shorter abbreviations, such

```bash
node createAliases.js | cat > ~/.docker_aliases && source ~/.docker_aliases
echo "[[ -f ~/.docker_aliases ]] && source ~/.docker_aliases" >> ~/.zshrc
```

