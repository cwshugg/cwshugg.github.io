---
layout: blog
title: Fuzzing the Tidy HTML Tool
subtitle: Bug Hunting with AFL++
date: 2023.02.21
author: Connor Shugg
categories: [Fuzzing, Security]
---

intro

#### `0.` Understanding The Target

tidy

#### `1.` Building with AFL++

cloning, building, and installing to local directory.

link back to AFL++ website and repo

#### `2.` Creating the Input Corpus

downloading HTML files from common websites to use as input

#### `3.` Fuzzing

kicking off AFL++ and waiting

#### `4.` Inspecting the Crash

using GDB to explore the bug


<!--
{% highlight c linenos %}
// Here's some C code.
int main(int argc, char** argv)
{
    printf("Hi\n");
}
{% endhighlight %}
-->

