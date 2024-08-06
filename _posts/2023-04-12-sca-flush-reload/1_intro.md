The **flush+reload** attack is one of the classic CPU cache timing attacks. An
attacker can use this attack to purposefully evict a specific address from the
CPU cache to learn if victim code (running on the same CPU) accessed the address
or not. The attack is made up of a few simple steps: 

1. The attacker flushes the target address from the CPU cache.
2. The attacker waits while the victim performs some routine.
3. The attacker reloads the target memory address and measures the time it
   takes.
4. The attacker, based on the timing measurement, infers whether or not the
   victim accessed the memory address during the wait period.

Simple enough, but why does this work? Because a CPU's cache is *shared* across
all programs running on that particular CPU. The memory accesses of one program
will affect the CPU cache for all other programs.

![](/images/posts/2023-4-12-sca-flush-reload/cpu_cache_sharing.png)

##### Cache Collisions

Furthermore, the CPU cache isn't large enough to hold *all* of the programs'
memory values, so two programs will eventually have to contend for one spot in
the cache (one spot being a **cache line**). This contention is called a
**cache collision**.

![](/images/posts/2023-4-12-sca-flush-reload/cpu_cache_contention.png)

Who wins the contention? Everybody and nobody. It all depends on *when* the two
programs access the cache line. If `Program-A` accesses the cache line first,
*its* memory values are copied into the line. (The same goes for if `Program-B`
accesses it first.) If, soon after `Program-A`, `Program-B` accesses the cache
line with its own set of values, `Program-A`'s values will be **evicted**, and
`Program-B`'s will take their place.

##### Access Speed as a Side-Channel

Now, we know that CPU caches exist to make memory accesses *faster* for
programs. If the CPU only needs to reach out to the cache to fetch a memory
value (rather than main memory, which is much farther away), the memory access
will complete in significantly less time. By contrast, if the CPU must reach out
to main memory, the access will take much longer to complete.

So, as long as we have a way to measure the timing of a memory access, we can
make a pretty educated guess as to whether or not a particular memory address
was loaded into the cache. An attacker can use this trick to spy on a victim
with whom a cache line is shared. By performing a memory access after the victim
executes some code, *how long* that access takes allows the attacker to infer
whether or not the victim accessed the cache line. This idea represenets the
**reload** part of the **flush+reload** attack. 

##### Controlling the Cache State - Flushing

What about the **flush** step in **flush+reload**? This first step is done so
the attacker can put the targeted cache line in a known state before the victim
executes. "Flushing" a cache line is invalidates it and forces the processor to
write any dirty values out to memory. This effectively "empties" out the cache
line, such that whoever accesses it next will cause the processor to take the
long hike out to main memory to retrieve the value and re-populate the cache
line.

Instruction sets such as Intel x86-64 and Arm64 implement instructions that
perform cache flushes (even at at the unprivileged level). So, `Program-A` can
issue a flush instruction:

![](/images/posts/2023-4-12-sca-flush-reload/cpu_cache_flush_1.png)

Which results in the contended cache line being emptied out:

![](/images/posts/2023-4-12-sca-flush-reload/cpu_cache_flush_2.png)

##### Putting it all Together

So, with the ability to flush cache lines and measure memory access times, an
attacker can flush, wait for the victim, then reload and measure timing.

* If the reload took too long, the attacker can most likely assume the victim
  did *not* access that cache line.
* But if the reload was *quick*, the attacker can most likely assume the victim
  *did* access that cache line.

![](/images/posts/2023-4-12-sca-flush-reload/cpu_cache_flushreload.png)

