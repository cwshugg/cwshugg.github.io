---
layout: simple
title: Blog Posts
permalink: /blog
---

{% for category in site.categories %}
<!-- Category Div -->
<div class="div-border-acc1 text-main">
    <!-- Header -->
    {% capture category_name %}{{ category | first }}{% endcapture %}
    <h3 class="text-header3 color-acc1">{{category_name}}</h3>
    
    <!-- Post List -->
    {% for post in site.categories[category_name] %}
    <article>
        <p>
        {{post.date | date: "%Y.%m.%d"}} -
        <a href="{{site.baseurl}}{{post.url}}">{{post.title}}</a>
        </p>
    </article>
    {% endfor %}
</div>
{% endfor %}

