#### Wrapping Things Up

At this point we're certain we've found a solid integer overflow bug. Before
creating a bug report, let's minimize the GIF using AFL++'s test case minimizer.
This'll make debugging easier for anyone that takes a crack at fixing the bug:

```bash
afl-tmin -i ./fuzz_run__0/default/crashes/id:000000* -o ./fuzz_run__0/crash0a.min ./catimg/bin/catimg @@
```

From here, I went ahead and submitted [a bug report](https://github.com/posva/catimg/issues/72)
to the developer on GitHub.

