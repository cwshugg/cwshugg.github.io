#### Wrapping Things Up

At this point we're certain we've found a solid integer overflow bug. Before
creating a bug report, let's minimize the GIF using AFL++'s test case minimizer.
This'll make debugging easier for anyone that takes a crack at fixing the bug:

```bash
afl-tmin -i ./fuzz_run__0/default/crashes/id:000000* -o ./fuzz_run__0/crash0a.min ./catimg/bin/catimg @@
```

From here, I went ahead and submitted [a bug report](https://github.com/posva/catimg/issues/72)
to the developer on GitHub. [Posva](https://github.com/posva), catimg's
developer, pointed out something I hadn't realized: this code is copied from the
[STB Library](https://github.com/nothings/stb). The bug has been patched in the
library (see the current version of [`stb_image.h`](https://github.com/nothings/stb/blob/master/stb_image.h)).

