---
layout: post
title: Fuzzing the Tidy HTML Tool
subtitle: Bug Hunting with AFL++
date: 2023.02.21
author: Connor Shugg
categories: Fuzzing
tags: [Fuzzing, Security, AFL++, C]
---

**Tidy** is an open-source tool for cleaning up HTML and XML files. According to
its [official website](https://www.html-tidy.org/), it's "the granddaddy of HTML
tools," capable of modernizing old HTML/XML while also fixing markup errors.
I've used the tool myself and it's incredibly handy - especially when I download
a gigantic HTML file from a website or need to do a quick check of my website's
HTML before pushing it up. 

Tidy is maintained by the **HTACG** (**HTML Tidy Advocacy Community Group**).
Their [GitHub page](https://github.com/htacg) has several repositories. Chief
among these is [`tidy-html5`](https://github.com/htacg/tidy-html5). This is
where the original implementation (updated to support HTML 5) lives.

A library is also provided for use in other software projects. Some of the
projects that use libtidy are listed on Tidy's website. Overall, it has a long
history and is an interesting piece of software. It's also an easy target for
fuzzing. Let's see if we can break it.

#### Understanding The Target

Fortunately for us, Tidy is implemented in C. This means we can easily fuzz it
with [AFL++](https://aflplus.plus). If you haven't heard of AFL++, it's worth
taking the time to read up. It's a phenomenal gray-box fuzzing tool that excels
at finding bugs in software. AFL++'s greatest strength is its ability to
instrument C code to detect control-flow changes in the target program during
execution. This allows it to continually improve its test cases in-flight.

In order for AFL++ to pass Tidy its test cases, we need to understand how Tidy
receives input from the user. Fortunately, passing HTML or XML to Tidy is as
simple as giving it something to read from `stdin`. One way we can achieve this
on the command line is by piping the contents of an HTML file directly into
Tidy:

```bash
tidy < ./index.html
```

AFL++ will handle this piping on its own. So we're done here - time to compile!

#### Building with AFL++

At this point all we need to do is build Tidy with AFL++'s compiler. First, we
clone the `tidy-html5` GitHub repository. Then, we simply follow
[`README/BUILD.md`](https://github.com/htacg/tidy-html5/blob/next/README/BUILD.md),
executing the following commands using `afl-clang-fast` as our compiler of
choice:

```bash
cd build/cmake
CC=afl-clang-fast cmake ../../ -DCMAKE_BUILD_TYPE=Debug -DCMAKE_INSTALL_PREFIX=/path/to/local/tidy-install
make
make install
```

Note the `-DCMAKE_INSTALL_PREFIX` argument I've added. This allows us to install
the AFL++-instrumented Tidy in a local directory without touching the rest of
the system. (Plus, this way we don't need `sudo` permission.)

The instrumented binary will be stored in `tidy-install/bin/tidy`.

#### Creating the Input Corpus

Next we're going to need a small set of initial input files to hand to AFL++.
Since Tidy parses HTML, we can simply download some HTML pages from live
websites and drop them in a directory. I used `wget` and a simple bash loop to
download HTML from a number of popular websites (and a few pages from my
personal website):

```bash
mkdir fuzz_inputs
cd fuzz_inputs

urls=("google.com" \
      "youtube.com" \
      "facebook.com" \
      "twitter.com" \
      ... \
      "instagram.com" \
      "wikipedia.org" \
      "duckduckgo.com")
for url in ${urls[@]}; do \
    wget "https://${url}/" \
done
```

#### Fuzzing

Finally, all that remains is invoking AFL++ to kick off the fuzzing campaign:

```bash
afl-fuzz -D -i ./fuzz_inputs -o ./fuzz_run__0 ./tidy-install/bin/tidy
```

Watch it for a minute to make sure it's discovering new paths and updating its
test case queue, then leave it be. In about seventeen minutes' time, we've found
two crashes and a number of hangs:

![The final AFL++ screen, revealing 2 crashes and 15 hangs.](/images/posts/fuzzing_tidy_aflpp.png)

#### Postmortem 1 - Inspecting the Crash

So we've found a crash. Let's bust out GDB to take a closer look:

```bash
gdb ./tidy-install/bin/tidy -ex "set args < fuzz_run__0/default/crashes/id:000000*"
```

(Pro-tip: use the `-ex` option to have GDB execute the given command on startup.
I'm using this here to set up command-line arguments for the target such that we
pipe in the contents of the crash-inducing test case AFL++ saved for us.)

At this point, we can `run`. This confirms that we got Tidy to crash with a
`SIGSEGV` (Segmentation Fault). Nice!

![GDB segmentation fault screen](/images/posts/fuzzing_tidy_gdb1.png)

The segfault occurred when `parser.c` line 143 was executed. This is a check
within the `InsertNodeAsParent()` function. What part of the if-statement
triggered an invalid memory access?

![GDB null pointer dereference](/images/posts/fuzzing_tidy_gdb2.png)

The `node` variable's `parent` field appears to be null. By attempting to access
`node->parent->content`, the program wrongly assumes `node->parent` is *never*
null, and thus makes a null pointer dereference. So, this is a valid bug
caused by the failure to check for a null pointer in `InsertNodeAsParent()`.

##### Shrinking the Test Case

Before submitting this as an issue to the Tidy developers, it would be smart to
minimize the test case AFL++ generated. This is easily done by AFL++'s built-in
tool, `afl-tmin`, and it produces a smaller test case file that causes the same
exact behavior. A smaller file will make for easier debugging of the issue.

```bash
afl-tmin -i ./fuzz_run__0/default/crashes/id:000000* -o ./fuzz_run__0/crash.min ./tidy-install/bin/tidy
```

And what do you know! The resulting `crash.min` file is incredibly small. The
entirety of its contents are:

```html
0<!d><h2 <div
```

##### Telling the Devs

It turns out another GitHub user found the exact same bug in an older version of
Tidy in May of 2022
([GitHub Issue #1038](https://github.com/htacg/tidy-html5/issues/1038)). The
issue he/she created hasn't gotten any attention yet, which explains why the bug
still exists a year later. But, still a nice find and a win for AFL++!

#### Postmortem 2 - Inspecting the Hang

Sometimes AFL++ will choose to save a test case that caused the target program
to time out. There are a multitude of reasons why (or why not) a timeout
indicates a true "hang" or "blocking" of the target program. So it's best to
inspect any saved hang-inducing test cases with a critical eye.

In this case, however, the fifteen individual hang-inducing test cases saved by
AFL++ indicate a true bug. An infinite loop! Let's examine what happens in GDB:

```bash
gdb ./tidy-install/bin/tidy -ex "set args < fuzz_run__0/default/hangs/id:000000*"
```

With the arguments set, we `run` and observe something interesting:

![GDB infinite loop](/images/posts/fuzzing_tidy_gdb3.png)

Whilst handling an anchor HTML tag (`<a></a>`), Tidy traps itself into
infinitely looping. We won't spend time digging into *why* this is happening,
but we can confirm another bug!

##### Shrinking the Test Case

Once again, it would be smart to minimize the hang-inducing test case to make
debugging easier. Let's fire up `afl-tmin` and specify `-H` to minimize in
hang mode.

```bash
afl-tmin -H -i ./fuzz_run__0/default/hangs/id:000000* -o ./fuzz_run__0/hang.min ./tidy-install/bin/tidy
```

After a few minutes we receive a much shorter test case:

```html
<!D a><li <a <a h
```

##### Telling the Devs

Once again, another GitHub user has already brought this bug to the attention of
the Tidy developers
([GitHub Issue #1021](https://github.com/htacg/tidy-html5/issues/1021)).
This issue has also not gotten any attention since its creation. But, once
again, it's still a solid find and a legit issue!

##### Security Food for Thought

Both bugs we found are interesting, but I'm particularly intrigued by the
infinite loop bug. Software that utilizes Tidy (or better yet: libtidy) may also
have this bug present. Forcing a program into an infinite loop can't provide
much grip for an attacker in terms of mounting a privilege escalation or code
injection attack, but it's an effective way to cause Denial of Service (DoS).
Consider a web server that utilizes libtidy to clean up HTML pages after they've
been modified by a user. If this infinite-loop bug exists, a properly-crafted
HTML payload could indefinitely hang one of the server's threads. Do this a few
more times and an attacker could get several, if not *all* of the server threads
stuck.

