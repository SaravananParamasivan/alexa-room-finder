#!/bin/bash

# Will crash if token isn't properly set-up in test/config.js
printf '\n Intent: Book \t State: Blank \n\n'
lambda-local -l lambda/index.js -h handler -e test/test-BookIntent-StateBLANK.js
printf '\n Intent: Book \t State: _CONFIRMMODE \n\n'
lambda-local -l lambda/index.js -h handler -e test/test-BookIntent-State_CONFIRMMODE.js
printf '\n Intent: Yes  \t State: Blank \n\n'
lambda-local -l lambda/index.js -h handler -e test/test-YesIntent-StateBLANK.js

# Running YesIntent_CONFIRMMODE after BookIntent_CONFIRMMODE will try to book the room
# twice in a row. The second one will then be declined by the room, as it's already booked.
# I therefore usually leave YesIntent_CONFIRMMODE out and test it separately if needs be.

# printf '\n Intent: Yes \t State: _CONFIRMMODE \n\n'
# lambda-local -l lambda/index.js -h handler -e test/test-YesIntent-State_CONFIRMMODE.js


#Won't crash if token isn't properly set-up in test/config.js
printf '\n Intent: LaunchRequest \n\n'
lambda-local -l lambda/index.js -h handler -e test/test-LaunchRequest.js
printf '\n Intent: Cancel \t State: Blank \n\n'
lambda-local -l lambda/index.js -h handler -e test/test-CancelIntent-StateBLANK.js
printf '\n Intent: Cancel \t State: _CONFIRMMODE \n\n'
lambda-local -l lambda/index.js -h handler -e test/test-CancelIntent-State_CONFIRMMODE.js
printf '\n Intent: Help \t State: Blank \n\n'
lambda-local -l lambda/index.js -h handler -e test/test-HelpIntent-StateBLANK.js
printf '\n Intent: Help \t State: _CONFIRMMODE \n\n'
lambda-local -l lambda/index.js -h handler -e test/test-HelpIntent-State_CONFIRMMODE.js
printf '\n Intent: No \t State: Blank \n\n'
lambda-local -l lambda/index.js -h handler -e test/test-NoIntent-StateBLANK.js
printf '\n Intent: No \t State: _CONFIRMMODE \n\n'
lambda-local -l lambda/index.js -h handler -e test/test-NoIntent-State_CONFIRMMODE.js
printf '\n Intent: Repeat \t State: Blank \n\n'
lambda-local -l lambda/index.js -h handler -e test/test-RepeatIntent-StateBLANK.js
printf '\n Intent: Repeat \t State: _CONFIRMMODE \n\n'
lambda-local -l lambda/index.js -h handler -e test/test-RepeatIntent-State_CONFIRMMODE.js
printf '\n Intent: StartOver \t State: Blank \n\n'
lambda-local -l lambda/index.js -h handler -e test/test-StartOverIntent-StateBLANK.js
printf '\n Intent: StartOver \t State: _CONFIRMMODE \n\n'
lambda-local -l lambda/index.js -h handler -e test/test-StartOverIntent-State_CONFIRMMODE.js
printf '\n Intent: Stop \t State: Blank \n\n'
lambda-local -l lambda/index.js -h handler -e test/test-StopIntent-StateBLANK.js
printf '\n Intent: Stop \t State: _CONFIRMMODE \n\n'
lambda-local -l lambda/index.js -h handler -e test/test-StopIntent-State_CONFIRMMODE.js
