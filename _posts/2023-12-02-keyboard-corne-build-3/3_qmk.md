#### Flashing QMK

[QMK](https://docs.qmk.fm/) is very well-known firmware and was written
specifically for driving keyboards. The QMK community has built in support for
*lots* of custom keyboards, and the Corne is one of them. There's lots of
documentation on how to build, modify, and flash QMK to microcontrollers such as
my two Elite-Cs.

I used the [QMK Toolbox](https://github.com/qmk/qmk_toolbox) on my Windows PC to
flash the compiled & assembled binary to each microcontroller. It's a very
simple GUI application that allows for quick selection and flashing of the
`.hex` file produced after building QMK.

You don't need to look far to find excellent documentation and tutorials on
building and flashing QMK, so I'll spare you the details. Let's see what the
default firmware looks like!

![The two OLED screens, lit up with the default QMK firmware](/images/posts/2023-12-02-keyboard-corne-build-3/qmk_default.jpg)

On the left-hand screen (which is designated as the "master" side of the
keyboard), a simple print-out of the current layer, followed by the latest key
that was pressed, is displayed. The right-hand screen shows the Corne keyboard
logo, followed by the word "corne" in a larger font. Nice!

##### Testing the Keys

I used the left-hand screen to test each of my switches to ensure they eached
registered as a key press. I wound up having to re-solder a few of the Kailh
hot-swap sockets around the keyboard (my initial soldering joint wasn't strong
enough, and snapped away from the PCB after a few key presses). I repeated this
process multiple times: testing, taking the keyboard apart, fixing some solder,
then buttoning it back up again. Tedious as it was, this was the final
hardware-related hurdle. Once all the keys worked, I moved onto installing the
keycaps.

