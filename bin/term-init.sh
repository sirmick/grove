# Sourced as bash --rcfile for the grove terminal. Keeps the user's shell, then puts grove + ai on
# PATH and prints a one-line orientation. GROVE_ROOT / GROVE_SPACE come from the pty's env.
[ -f /etc/bash.bashrc ] && source /etc/bash.bashrc
[ -f "$HOME/.bashrc" ] && source "$HOME/.bashrc"

export PATH="$GROVE_ROOT/bin:$GROVE_ROOT/node_modules/.bin:$HOME/.local/bin:$PATH"

printf '\n\033[1;32m🌳 grove terminal\033[0m  ·  space: %s\n' "${GROVE_SPACE:-?}"
printf '   \033[2mgrove collections tree   ·   grove --help\033[0m\n'
printf '   \033[2mai\033[0m   → launch Claude, seeded with grove + project context\n\n'
