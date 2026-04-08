---
layout: relf
title: "RELF"
permalink: /relf
extra_css:
  - /css/relf.css
extra_js:
  - /script/relf/lib/cellauto.js
  - /script/relf/relf.js
  - /script/relf/renderer.js
  - /script/relf/interface.js
---

After playing around with
[Cellular Automata](https://en.wikipedia.org/wiki/Cellular_automaton)
and zero-player games, I decided to create one of my own.
This one is called **relf**, short for **rectangular lifeforms**.
It's a game of life, of sorts. Each relf has its own priorities and
does its own actions.
Relves interact with each other, both in good and bad ways.

I used Jonas Olmstead's
[cellauto](https://github.com/sanojian/cellauto)
library to simulate the world and the
[pixi.js](https://pixijs.com/)
library to draw it on this canvas.

## Basic Relf Types

<div class="div-main div-border-acc1 border-nomad">
<h3 class="color-nomad">Nomads</h3>
<p>
Nomads are wanderers. They travel alone and only settle down
when the conditions are right.
</p>
<h4 class="color-nomad">Nomad Rules of Life</h4>
<ul>
<li>If a nomad has <em>two</em> other nomad neighbors, it will become a <span class="color-settler">settler</span>.</li>
<li>If a nomad has <em>one</em> or <em>two</em> neighboring settlers, it will become a <span class="color-settler">settler</span>.</li>
<li>If a nomad is completely surrounded by settlers, it will revolt and become a <span class="color-hunter">hunter</span> in its panic.</li>
</ul>
</div>

<div class="div-main div-border-acc1 border-settler">
<h3 class="color-settler">Settlers</h3>
<p>
Settlers band together with other settlers and do not wander.
They are <em>so</em> reliant on one another, in fact, that a
settler will die if it has no neighbors of its kind. Under the
correct conditions, a settler will reproduce to create
new relves.
</p>
<h4 class="color-settler">Settler Rules of Life</h4>
<ul>
<li>If a settler has no other neighboring settlers, it will die.</li>
<li>If a settler can move to a nearby square to get more neighbors or position themselves closer to existing neighbors, it will do so.</li>
<li>If a settler has exactly <em>three</em> neighboring settlers, it may reproduce to create a new <span class="color-nomad">nomad</span>. On rare occasions, the settler may instead reproduce to create a new <span class="color-hunter">hunter</span>.</li>
<li>If a settler lives long enough, it will eventually corrupt and become a <span class="color-hunter">hunter</span>.</li>
<li>On rare occasions, a settler may evolve into a <span class="color-noble">noble</span>.</li>
</ul>
</div>

<div class="div-main div-border-acc1 border-hunter">
<h3 class="color-hunter">Hunters</h3>
<p>
Hunters seek out and kill settlers. They travel like nomads, and
can kill a finite number of settlers before dying.
</p>
<h4 class="color-hunter">Hunter Rules of Life</h4>
<ul>
<li>If a hunter has at least one neighboring settler, it will kill one and lose one hit point.</li>
<li>If a hunter has zero hit points, it will die.</li>
<li>If a hunter lives long enough, it will eventually calm down and become a <span class="color-nomad">nomad</span>.</li>
<li>On rare occasions, a hunter may transform into a <span class="color-warlock">warlock</span>.</li>
</ul>
</div>

## Special Relf Types

<div class="div-main div-border-acc1 border-warlock">
<h3 class="color-warlock">Warlocks</h3>
<p>
Warlocks use dark magic to summon hunters in bursts of magic.
They remain stationary, but will fire one or more bursts before
dying to the dark magic they wield. Each burst creates eight
<span class="color-hunter">hunters</span> from the warlock's
location.
</p>
<h4 class="color-warlock">Warlock Rules of Life</h4>
<ul>
<li>If a warlock has completed all of its bursts, it will die.</li>
</ul>
</div>

<div class="div-main div-border-acc1 border-noble">
<h3 class="color-noble">Nobles</h3>
<p>
Nobles are an evolved form of settler. They do not corrupt into
hunters and they cannot reproduce to create hunters. Nobles are
also stronger against hunter attacks: they can take multiple hits
before dying.
</p>
</div>
