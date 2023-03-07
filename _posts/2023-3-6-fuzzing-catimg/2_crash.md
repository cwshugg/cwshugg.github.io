#### Postmortem - Inspecting the Crash

Let's examine the crash AFL++ reported. Our good friend GDB can assist us here:

```bash
gdb ./catimg/bin/catimg -ex "set args fuzz_run__0/default/crashes/id:000000*"
```

With the arguments set, we can `run` to observe the `SIGSEGV` (Segmentation
Fault). Excellent.

![GDB showing the segmentation fault](/images/posts/2023-3-6-fuzzing-catimg/fuzzing_catimg_2_gdb1.png)

We can see it failed during a call to `memset()`, a standard C function used to
fill a memory region with a single byte's value. In this case, some struct,
called `g`, is having its `history` field (apparently a pointer to some memory),
zeroed out.

![GDB showing a null pointer](/images/posts/2023-3-6-fuzzing-catimg/fuzzing_catimg_3_gdb2.png)

Interesting. `g->history` is actually `NULL`, which explains the segfault. You
can't write bytes into address `0x0`. This is a classic "failure to check for
null" bug. Somehow, this input file caused `g->history` to be `NULL`, which was
a situation the developer didn't anticipate.

##### Digging Deeper

Let's debug this a little bit. This code lives in `src/stb_image.h` -
specifically in the `stbi__gif_load_next()` function. (We're dealing with a GIF
image file.) A few lines before the faulty `memset()`, `g->history` is assigned
what appears to be a chunk of heap-allocated memory:

![Examining source code](/images/posts/2023-3-6-fuzzing-catimg/fuzzing_catimg_4_code1.png)

Nothing else happens to `g->history` between these two lines, so
`stbi__malloc()` *must* be returning a null pointer. `stbi__malloc()`'s code is
straightforward: it invokes `STBI_MALLOC()`, a macro that simply invokes
`malloc()`, the standard C memory allocation function:

![Examining source code for stbi_malloc()](/images/posts/2023-3-6-fuzzing-catimg/fuzzing_catimg_5_code2.png)

Now here's something interesting: `stbi__malloc()` accepts a `size_t`, which is
passed into `malloc()`. A `size_t` represents an unsigned integer. From the
previous function, we saw that the value being passed into `stbi__malloc()` was
the multiplication of two integers:

```c
g->history = (stbi_uc *) stbi__malloc(g->w * g->h);
```

Let's see what type `g->w` and `g->h` are:

![Examining source code for the stbi__gif struct](/images/posts/2023-3-6-fuzzing-catimg/fuzzing_catimg_6_code3.png)

They're standard `int`s, which are *signed* integers. Two signed integers
multiplied together *might* compute a negative value, if the two integers are
large enough to result in a product larger than the signed integer maximum.
Let's see if that's true here:

![GDB showing an integer overflow](/images/posts/2023-3-6-fuzzing-catimg/fuzzing_catimg_7_gdb3.png)

Sure enough, `g->w` is 65535 and `g->h` is 33023. These two numbers multiplied
together would normally produce 2164162305, but since we're dealing with
*signed* integers limited to 32 bits in width, that value "wraps around" to
produce a negative value. And, oh boy! Check out the value that's passed to
`malloc()` when `stbi__malloc()` interprets the result as a `size_t`:
**18446744071578746625**. Wow. That means this particular GIF has caused catimg
to request *18.4 exabytes* from the operating system. (That's *18.4 billion
gigabytes*.) Considering the system I'm running this on has exactly 8 gigabytes
of RAM, this allocation request will most certainly fail. Thus, `malloc()`
returns `NULL`, revealing the root cause of this bug.

