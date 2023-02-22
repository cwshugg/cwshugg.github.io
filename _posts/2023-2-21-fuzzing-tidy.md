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

We know what Tidy *does*, but we need to answer a few more questions before we
can figure out how to fuzz it:

###### What language is Tidy implemented in?

Taking a quick glance at the GitHub repository (linked above), we can see it's
implemented in C. This means we can easily fuzz it with
[AFL++](https://aflplus.plus).

###### How does Tidy receive input?

In order to pass Tidy fuzzed test cases, we need to understand how it receives
input from the user. Fortunately, passing HTML or XML to Tidy is as simple as
giving it something to read from `stdin`. One way we can achieve this on the
command line is by piping the contents of an HTML file directly into Tidy:

{% highlight bash %}
tidy < ./index.html
{% endhighlight %}

#### Building with AFL++

At this point all we need to do is build Tidy with AFL++'s compiler. First, we
clone the `tidy-html5` GitHub repository. Then, we simply follow
[`README/BUILD.md`](https://github.com/htacg/tidy-html5/blob/next/README/BUILD.md),
executing the following commands using `afl-clang-fast` as our compiler of
choice:

{% highlight bash %}
cd build/cmake
CC=afl-clang-fast cmake ../../ \
    -DCMAKE_BUILD_TYPE=Debug \
    -DCMAKE_INSTALL_PREFIX=/path/to/local/tidy-install
make
make install
{% endhighlight %}

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

{% highlight bash %}
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
{% endhighlight %}

#### Fuzzing

Finally, all that remains is invoking AFL++ to kick off the fuzzing campaign:

{% highlight bash %}
afl-fuzz -D \
         -i ./fuzz_inputs/ \
         -o ./fuzz_run__0 \
         ./tidy-install/bin/tidy
{% endhighlight %}

Watch it for a minute to make sure it's discovering new paths and updating its
test case queue, then leave it be. In about seventeen minutes' time, we've found
two crashes and a number of hangs:

![The final AFL++ screen, revealing 2 crashes and 15 hangs.](/images/posts/fuzzing_tidy_aflpp.png){:width="100%"}

#### Inspecting the Crash

up next: using GDB to explore the bug

