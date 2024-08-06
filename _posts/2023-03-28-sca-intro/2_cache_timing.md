#### Cache Timing Attacks

The fundamental building block of Spectre and Meltdown is the **cache timing
attack**. It's a more primitive side-channel attack that makes clever usage of
timers and/or performance counters to time memory accesses. By timing memory
accesses, an attacker can learn if a particular address was already present in
the CPU's cache or not. With this information, the attacker can infer if a
victim routine/program/process accessed that address when executing some code.

There are several kinds of cache timing attacks, but for the sake of simplicity,
we'll focus on the **flush+reload** attack.

##### Plan of Attack

Let's say we're an attacker that's interested in learning if some other code on
thehave some address, `0xdeadbeef`, that we're interested i

