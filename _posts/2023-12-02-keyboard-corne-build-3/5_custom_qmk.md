#### Customing QMK

With the full keyboard assembled, I spent time writing my own C code to
customize my keyboard's key mapping, OLED screen content, and overall behavior.
My implementation is [open-sourced on GitHub](https://github.com/cwshugg/qmk).

##### Key Mapping and Layers

At the time of writing this, I implemented a total of eight layers in the
keyboard:

* The **Default Layer** contains all 26 letters of the alphabet, the common
  modifier keys (Ctrl, Alt, Shift), and a few others. (This layer is what the
  keycaps correspond to.)
* The **Lower Layer**, which is accessible by holding down the "layer down" key,
  contains numbers, a few mathematical symbols, and media keys (volume up,
  volume down, next song, play/pause, etc.)
* The **Raise Layer**, which is accessible by holding down the "layer up" key,
  contains all other symbols, arrow keys, home/end, and page up/page down.
* The **Super Layer**, which is accessible by holding down *both* the "layer up"
  and "layer down" keys, contains the function keys (F1, F2, etc.), and a
  special way to navigate to the gaming layers.

To navigate to my gaming layers, I tap a specific key in the **super layer**
three times. Once that happens, the keyboard permanently switches to **gaming
layer 0**.

* **Gaming Layer 0** is a near duplicate of the **default layer**. The space bar
  is duplicated to be on both sides of the keyboard (so I can use my mouse with
  my right hand).
* **Gaming Layer 1** moves all the numbers to the left-hand side of the keyboard
  (again, so I can use my mouse).
* **Gaming Layer 2** is a near duplicate of the **raise layer**.
* **Gaming Layer 3** is a near duplicate of the **super layer**. In this layer,
  the same special key that originally takes me from the **super layer** to the
  gaming layer, instead permanently takes the keyboard back to the **default
  layer**.

##### OLED Customization

I also spent some time writing code to customize the content on the two OLED
screens. At the time of writing this, I've only given the left-hand OLED screen
a job; the right-hand screen is off. Here's what I cooked up:

![My final keycap layout, with all the keycaps installed on the keyboard](/images/posts/2023-12-02-keyboard-corne-build-3/keycaps.jpg)

Eventually, I'd like to add a display of what modifiers are currently active
(caps lock, ctrl, alt, shift, etc.), and I'd like to give the right-hand screen
something else entirely to display.

