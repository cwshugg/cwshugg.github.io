If I told you to think of a security exploit, chances are you'd come up with a
classic software-based vulnerability. Something like a buffer overflow,
return-oriented programming, or heap-spraying attack. Or perhaps something
higher up on the software stack: cross-site scripting, SQL injection, or
cross-site request forgery. All of these have something in common: they are
made possible by faulty software.

What if the software is secure, but the underlying hardware is faulty?
Since late 2017, it's become clear this is something we need to be mindful of.
The [Spectre and Meltdown](https://spectreattack.com/) CPU vulnerabilities take
advantage of modern processor features to leak privileged memory through the
CPU caches. The beauty of these vulnerabilities means an attacker operating
with user-space privileges can abuse the processor to leak privileged memory,
totally bypassing any software protections put in place.

