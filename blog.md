---
layout: blog
title: Blog Posts
permalink: /blog
---

<ul>
    {% for post in site.posts %}
    <li>
        {% if post.date %}
        {{post.date}}
        {% endif %}

        <a href="{{post.url}}">{{post.title}}</a>
    </li>
    {% endfor %}
</ul>

