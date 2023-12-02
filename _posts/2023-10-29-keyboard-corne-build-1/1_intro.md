I've used the same keyboard for years. My trusty Razer Ornata Chroma has served
me exceedingly well throughout college and into my working years. It's been my
companion while completing hundreds of projects and assignments, writing my
thesis, pouring hours into games, and doing other everday computers tasks. All
that use has left it with shiny keys, torn cloth on the wrist wrest, and several
"mecha-membrane" keys that no longer play their signature *click*. Despite that,
it continues to press on and refuses to fail. I might as well use this keyboard
forever, right?

![My tired and worn Razer Ornata Chroma](/images/posts/2023-10-29-keyboard-corne-build-1/razer_ornata_chroma.jpg)

Well, *enter physical health*. For the past few months, I've been experiencing
wrist and finger pain that fades in and out depending on my computer usage.
Carpal Tunnel Syndrome and other similar ailments are common for people who use
the computer for the majority of their day. To attempt to alleviate these
symptoms and to take a step into the crazy world of mechanical keyboards, I
decided to build my own **Corne Keyboard** (**CRKBD**).

#### Corne? Like the Crop?

**Corne**, (not **corn**), is a split mechanical keyboard designed by
[foostan](https://github.com/foostan), and is completely open source. It sports
42 keys (*much* less than a standard keyboard!), two microcontrollers running
QMK, and optional OLED screens. Check out
[foostan's GitHub repository](https://github.com/foostan/crkbd)
for pictures and the full design.

CRKBD is an **ortholinear** keyboard, which means the rows of keys are
vertically aligned, unlike the offset rows you see in a standard keyboard.
This design gives the benefit of matching the natural extension of your fingers,
which is supposed to make for smoother movements and less finger strain.

On top of that, it's a split keyboard. The idea with a split keyboard is to
place the halves further apart to keep your wrists as relaxed as possible.

#### Acquire the Corne

Because it's open source, the entire PCB (**Printed Circuit Board**) design is
available on the repository. Keyboard vendors can print these designs and sell
parts for building a CRBKD. I opted to purchase a full kit and case from
[Little Keyboards](https://www.littlekeyboards.com/). The kit came with:

* 2 Corne PCBs
* 2 TRRS jacks
* 2 reset switches
* 42 diodes (one for each key)
* 42 Kailh MX sockets (one for each key)

On top of this, I ordered two Elite-C microcontrollers and two small OLED
screens. The microcontrollers are needed (one for each side of the split
keyboard) to run QMK, which is responsible for processing key presses and
sending them to the computer the keyboard is plugged in to.

Here's what we're working with:

![All the components of the corne keyboard](/images/posts/2023-10-29-keyboard-corne-build-1/kit_all.jpg)

Can't see the microcontrollers or OLED screens through those ESD bags? Don't
worry, we'll get there.

##### Switches and Keycaps

The last component needed for the keyboard, aside from all the hardware, was of
course mechanical switches and a set of keycaps. I went for Gateron G Pro 2.0
red switches, which are linear in feel and *very* satisfying to use.

![The switches sitting in a plastic jug](/images/posts/2023-10-29-keyboard-corne-build-1/switches_jug.jpg)

![A GIF of me pressing the switch up and down with my finger](/images/posts/2023-10-29-keyboard-corne-build-1/switches_demo.gif)

As for the keycaps, I found a nice set of PCB caps on Amazon and laid them out
in a first-attempt pattern:

![My first attempt at a layout for my keyboard, using keycaps laid out on a
piece of paper](/images/posts/2023-10-29-keyboard-corne-build-1/keycaps_layout.jpg)


