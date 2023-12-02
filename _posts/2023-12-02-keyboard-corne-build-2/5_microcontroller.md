#### Microcontrollers

Soldering the two Elite-C microcontrollers was careful work. They each have 24
pins, and each pin needs soldering in two places:

1. First, the pins themselves need to be soldered to the pin-holes on the
   Elite-C.
2. Next, the other end of the pins need to be soldered to the PCB.

For obvious reasons, the USB-C port must be pointing away from the PCB, so a
USB-C cable can be plugged in to power the microcontroller.

![The Elite-C, put in place, but not yet soldered](/images/posts/2023-12-02-keyboard-corne-build-2/elitec_presolder.jpg)

I took my time with this part, ensuring I didn't accidentally create a bridge
between two adjacent pins on the Elite-C. Doing that would likely create some
strange issues with the microcontroller's behavior, and the entire keyboard
wouldn't work properly as a result. I also was careful to spend as little time
as possible with the soldering iron's tip on the microcontroller. Heating up the
microcontroller too much can permanently damage it.

![The Elite-C, soldered into place](/images/posts/2023-12-02-keyboard-corne-build-2/elitec_complete.jpg)

