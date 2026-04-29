---
layout: default
title: "About Me"
permalink: /me
extra_css:
  - /css/me.css
---

<div style="text-align: center;">
    <div style="width: 280px; height: 280px; border-radius: 50%; overflow: hidden; margin: 0 auto;">
        <img src="/images/polygon_guy.png" alt="polygon guy" style="width: 100%; height: 100%; object-fit: cover; object-position: center 60%; border: none; box-shadow: none;">
    </div>
</div>

# About Me

## <span style="color: var(--color-accent2);"><i class="fa fa-scroll"></i></span> Background

I'm a software engineer with a passion for invention and security.
I graduated from Virginia Tech in 2021 with a B.S. in computer science and a minor in cyber security.
A year later, I graduated with a M.S. (also in computer science), focusing on computer systems and security, with an emphasis on fuzzing.

I enjoy software development, exploring software security, writing, and generally creating things in my free time.

### Timeline

<div class="career-timeline">
    <div class="career-entry">
        <span class="career-date">Aug 2024 – Present</span>
        <h5 class="career-title">Microsoft — Software Engineer</h5>
        <p>
            I'm an engineer at Microsoft. I currently work on the <a href="https://azure.microsoft.com/en-us/solutions/confidential-compute/">Azure Confidential Compute</a> platform, which aims to keep sensitive data secure mid-execution using hardware-based Trusted Execution Environments.
            (If you'd like to learn more about the field, take a look at the <a href="https://confidentialcomputing.io/">Confidential Computing Consortium</a>.)
        </p>
        <p>
            Specifically, I've been heavily contributing to Microsoft's <a href="https://techcommunity.microsoft.com/blog/AzureInfrastructureBlog/securing-azure-infrastructure-with-silicon-innovation/4293834">Azure Integrated HSM</a> (<strong>HSM</strong> meaning <strong>Hardware Security Module</strong>).
            This is a small hardware device that offloads crypto operations and allows keys to be stored and used in a hardware isolated TEE (Trusted Execution Environment).
            Check out the <a href="https://github.com/microsoft/AziHSM-Guest">AziHSM GitHub repo</a> for a little more information.
        </p>
    </div>
    <div class="career-entry">
        <span class="career-date">Aug 2022 – Aug 2024</span>
        <h5 class="career-title">Microsoft — Security Verification Engineer</h5>
        <p>
            In my previous role at Microsoft, I contributed to some exciting security work involving speculative-execution side-channel attacks (remember <a href="https://spectreattack.com">Spectre and Meltdown</a>?) and other architectural attacks.
            I worked on the Microsoft Pluton Security processor and the <a href="https://azure.microsoft.com/en-us/blog/azure-cobalt-100-based-virtual-machines-are-now-generally-available/">Microsoft Cobalt processor</a>.
            Through my contributions and utilization of <a href="https://www.microsoft.com/en-us/research/publication/revizor-testing-black-box-cpus-against-speculation-contracts/">Revizor</a>, Microsoft's side-channel vulnerability fuzzer, I co-authored a patent and submitted it to the US Patent Office (<code>US-20250005164-A1</code>).
        </p>
        <p>
            Additionally, I developed new AI-based tools and helped lead the usage of LLMs in my organization's day-to-day engineering workflows.
            Chief among these was an image processing system that converted diagrams into executable Python code.
        </p>
    </div>
    <div class="career-entry">
        <span class="career-date">Aug 2020 – May 2022</span>
        <h5 class="career-title">Virginia Tech — Master's Degree</h5>
        <p>
            I completed my Master's Degree in Computer Science at Virginia Tech, where I learned the ins and outs of software fuzzing.
            I created <i>Gurthang</i>, a fuzzing framework designed specifically for fuzz-testing web servers.
            It's a fuzzing harness for AFL++ capable of sending multiple payloads to a web server simultaneously, allowing for effective testing for concurrency-related bugs induced when servers handle multiple requests at once.
            <a href="/gurthang">Read more about it here!</a>
        </p>
    </div>
    <div class="career-entry">
        <span class="career-date">Aug 2019 – May 2022</span>
        <h5 class="career-title">Virginia Tech Computer Science — Teaching Assistant</h5>
        <p>
            I worked as a Teaching Assistant with the Virginia Tech Computer Science department for five semesters. I spent four of those five semesters working on CS 3214 - Computer Systems, both as an undergraduate and graduate TA.
            This class is notorious for its challenging assignments and comprehensive C-based software engineering projects.
            I absolutely loved it; it sparked my passion for lower-level OS/systems-level software.
        </p>
        <p>
            I had the opportunity to assist hundreds of students with complex systems programming projects involving Linux processes, multithreading, memory management, virtualization, security, and networking, all with a heavy emphasis on writing robust and high-performing code.
        </p>
    </div>
</div>

### Skills

<div class="div-deck">
<div class="div-main">
<h6 class="color-text1">Technical</h6>
<p class="text-skill">
<code>Software Engineering</code>
<code>Object-Oriented Programming</code>
<code>Algorithms &amp; Data Structures</code><br>
<code class="color-acc3">Cryptography</code>
<code class="color-acc3">Operating Systems</code>
<code class="color-acc3">Processes</code>
<code class="color-acc3">Multithreading</code>
<code class="color-acc3">Memory Management</code>
<code class="color-acc3">Networking</code>
<code class="color-acc3">Virtualization</code>
<code class="color-acc3">Linux Kernel</code><br>
<code class="color-acc5">Fuzzing</code><br>
<code class="color-acc2">Software Security</code>
<code class="color-acc2">Network Security</code>
<code class="color-acc2">Cryptography</code>
<code class="color-acc2">Cache Timing Attacks</code>
<code class="color-acc2">Speculative Execution Attacks</code>
</p>
</div>
<div class="div-main">
<h6 class="color-text1">Languages</h6>
<p class="text-skill">
<code class="color-acc3">Rust</code>
<code class="color-acc3">C</code>
<code class="color-acc3">C++</code>
<code class="color-acc3">x86 Assembly</code>
<code class="color-acc3">Arm64 Assembly</code><br>
<code>Python</code>
<code>Bash Scripting</code>
<code>PowerShell Scripting</code>
<code>Java</code>
<code>C#</code><br>
<code class="color-acc4">JS/TS</code>
<code class="color-acc4">HTML</code>
<code class="color-acc4">CSS</code>
<code class="color-acc4">Vim Script</code>
</p>
</div>
<div class="div-main">
<h6 class="color-text1">Software / Tools</h6>
<p class="text-skill">
<code>Linux</code>
<code>Windows</code>
<code>Bash</code>
<code>WSL</code>
<code>Git</code>
<code>Vim</code><br>
<code class="color-acc3">GDB</code>
<code class="color-acc3">WinDBG</code>
<code class="color-acc3">Valgrind</code>
<code class="color-acc3">QEMU</code>
<code class="color-acc3">strace</code><br>
<code class="color-acc5">libfuzzer</code>
<code class="color-acc5">AFL/AFL++</code>
<code class="color-acc5">cargo-fuzz</code>
<code class="color-acc5">Radamsa</code>
<code class="color-acc5">Wfuzz</code><br>
<code class="color-acc2">Kali Linux</code>
<code class="color-acc2">Burp Suite</code>
<code class="color-acc2">nmap</code>
<code class="color-acc2">tcpdump</code>
<code class="color-acc2">Wireshark</code>
<code class="color-acc2">John the Ripper</code><br>
<code class="color-acc4">GitHub</code>
<code class="color-acc4">Azure Web Portal</code>
<code class="color-acc4">Azure CLI</code>
<code class="color-acc4">Azure DevOps</code>
</p>
</div>
</div>

---

## <span style="color: var(--color-accent2);"><i class="fas fa-hammer"></i></span> Projects

Creation is one of my greatest passions in life.
Turns out that a knack for making things plus a couple of computer science degrees equals a whole lot of projects.
Here are a few notable mentions of things I've created (or am still creating):

* [DImROD](https://github.com/cwshugg/dimrod) - My custom-built smart-home driver and personal server.
* [shuggtools](https://github.com/cwshugg/shuggtools) - My dotfiles, scripts, vim configurations, and everything else that I use to set up my command-line environment.
* [cobots](https://github.com/cwshugg/cobots) - My AI tooling setup: agents, skills, instructions, etc.
* [Custom QMK firmware](https://github.com/cwshugg/qmk), for a mechanical keyboard I built.

I've also dabbled with Vim plugins. Here are a few plugins I've written:

* [argonaut.vim](https://github.com/cwshugg/argonaut.vim), a plugin that provides command-line argument parsing and rich tab completion for Vim commands.
* [fops.vim](https://github.com/cwshugg/fops.vim), a plugin that provides several Vim commands for interacting with files.
* [lexicon.vim](https://github.com/cwshugg/lexicon.vim), a plugin that uses the [Datamuse API](https://www.datamuse.com/api/) to perform dictionary and thesaurus lookups in-editor.
* [dwarrowdelf](https://github.com/cwshugg/dwarrowdelf), my custom Vim theme.

I also worked on some pretty neat projects in school. Here are some of my favorites:

* [Gurthang](/gurthang), my M.S. thesis project
* HTTP/1.1-compliant Web Server, featuring multithreading and response caching (C)
* Memory Allocator & Manager (C) (like LibC's malloc interface)
* Threadpool (C)
* Extensible Linux Shell (C)
* P2P secure & scalable messaging protocol (Rust) (senior capstone)
* Simple one-time pad encryption networking protocol (Java)
* Simplified MIPS32 assembler (C)
* Rust implementation of the Linux kernel's ramfs

Other stuff I've built into this website:

* [A variety of tools](/tools)
* [RELF](/relf), my zero-player cellular automata game

