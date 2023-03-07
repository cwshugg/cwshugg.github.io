Want to display an image directly in the terminal? It just so happens there's a
nifty tool for that: [catimg](https://github.com/posva/catimg). It's pretty
simple: catimg accepts the path to an image file and prints the image to the
terminal as accurately as possible:

![Displaying my Alma Mater's logo with catimg](/images/posts/2023-3-6-fuzzing-catimg/fuzzing_catimg_0_example.png)

#### Fuzzing Catimg

Catimg is written in C. Let's fuzz it with [AFL++](https://aflplus.plus/)!

##### Building with AFL++

Building catimg is dead simple. All we need to do is clone the repository:

```bash
git clone https://github.com/posva/catimg
```

Then build with the AFL++ compiler:

```bash
cd catimg
CC=afl-clang-fast cmake ./
make
```

The resulting instrumented binary will be stored at `catimg/bin/catimg`.

##### Creating the Input Corpus

We need a small collection of images to use as an input corpus. We'll find some
by heading to [unsplash](https://unsplash.com/images/stock) to download a few
stock photos:

* [A dog](https://unsplash.com/photos/U3aF7hgUSrk)
* [Some cheese](https://unsplash.com/photos/jeAjT87nbjM)
* [An angry man](https://unsplash.com/photos/r-enAOPw8Rs)
* [An astronaut](https://unsplash.com/photos/Yj1M5riCKk4)

Each of these images download as a `.jpg`. This is a good start, but
considering there are a multitude of formats catimg supports, we'll create
copies of each one across four different image formats:

* JPEG (`.jpg`)
* PNG (`.png`)
* BMP (`.bmp`)
* GIF (`.gif`)

Placing these all inside a directory gives us our final set of inputs:

```
823002  Mar  5 17:16 angryman.bmp
89750   Mar  5 17:16 angryman.gif
27237   Mar  5 17:16 angryman.jpg
72473   Mar  5 17:16 angryman.png
1231962 Mar  5 17:16 astronaut.bmp
63818   Mar  5 17:16 astronaut.gif
22374   Mar  5 17:16 astronaut.jpg
146094  Mar  5 17:16 astronaut.png
1539162 Mar  5 17:16 cheese.bmp
237063  Mar  5 17:16 cheese.gif
70338   Mar  5 17:16 cheese.jpg
472064  Mar  5 17:16 cheese.png
823002  Mar  5 17:16 dog.bmp
118989  Mar  5 17:16 dog.gif
33805   Mar  5 17:16 dog.jpg
224437  Mar  5 17:16 dog.png
```

##### Fuzzing

Finally, we'll fire up AFL++ with our input set:

```bash
afl-fuzz -D -i ./fuzz_inputs -o ./fuzz_run__0 ./catimg/bin/catimg @@
```

AFL++ interprets the `@@` symbol as the location into which it places the path
to its current input file. With each iteration, the fuzzer will drop in the path
to a new file.

Sit back and relax. Nearly a day later, we've found ourselves a crash:

![AFL++'s status screen, 20 hours later](/images/posts/2023-3-6-fuzzing-catimg/fuzzing_catimg_1_aflpp.png)

