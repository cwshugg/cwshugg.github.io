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

