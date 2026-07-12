#!/bin/zsh
export DEVECO_SDK_HOME="/Applications/DevEco-Studio.app/Contents/sdk"
/Applications/DevEco-Studio.app/Contents/tools/node/bin/node /Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw.js --stop-daemon
/Applications/DevEco-Studio.app/Contents/tools/node/bin/node /Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw.js --mode module -p product=default assembleHap --analyze=normal --parallel --incremental --daemon
