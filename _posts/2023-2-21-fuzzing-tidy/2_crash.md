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

