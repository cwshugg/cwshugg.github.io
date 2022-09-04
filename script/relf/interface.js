// This file pulls from the library/world/rendering code files to interact with
// the actual HTML page and make things visible.
// This file assumes the corresponding HTML has imported all necessary JS files.

// HTML elements
const canvas = document.getElementById("board");
const in_world_w = document.getElementById("in_world_width");
const in_world_h = document.getElementById("in_world_height");
const in_world_s = document.getElementById("in_world_size");
const in_world_seed = document.getElementById("in_world_seed");
const btn_run = document.getElementById("btn_run");
const btn_reset = document.getElementById("btn_reset");
const btn_step = document.getElementById("btn_step");
const btn_share = document.getElementById("btn_share");

// Game objects
let started = false;
let running = false;
let world = null;       // CAWorld object
let rend = null;        // Renderer object

// Function that initializes the game world and renders it onto the canvas,
// given a few parameters.
function game_init(width, height, size, seed)
{
    seed_rand(seed);
    world = world_init(width, height, size);
    rend = new Renderer(world, canvas);

    // draw and refresh for the first time
    rend.draw();
    rend.refresh();
}

// Invoked when an input field is modified.
function game_reset()
{
    // parse the values from each input
    let w = parseInt(in_world_w.value);
    let h = parseInt(in_world_h.value);
    let s = parseInt(in_world_s.value);
    let seed = parseInt(in_world_seed.value);
    game_init(w, h, s, seed);
}

// Used to pause the game animation.
function game_pause()
{
    running = false;
    btn_run.innerHTML = "RUN";
}

// Used to resume the game animation.
function game_resume()
{
    running = true;
    btn_run.innerHTML = "PAUSE";
}

// Invoked when pressing the "STEP" button. Pauses the game and advances
// it by one step.
function game_step()
{
    game_pause();
    world.step();
    rend.refresh();
}

// Invoked for each animation frame.
function game_animation_step()
{
    if (running)
    {
        world.step();
        rend.refresh();
    }

    window.requestAnimationFrame(game_animation_step);
}

// Invoked when the "RUN" button is pressed.
function game_run()
{
    // only start it (request an animation frame) once!
    if (!started)
    {
        started = true;
        window.requestAnimationFrame(game_animation_step);
    }

    // otherwise, we'll pause or unpause accordingly
    if (!running)
    { game_resume(); }
    else
    { game_pause(); }
}

// Invoked when the "share" button is clicked.
function game_share()
{
    // build the correct URL (start by removing any existing URL parameters)
    let url = window.location.href;
    let param_idx = url.indexOf("?");
    if (param_idx < 0)
    { param_idx = url.length; }
    url = url.substring(0, param_idx);

    // append each appropriate parameter
    url += "?width=" + in_world_w.value;
    url += "&height=" + in_world_h.value;
    url += "&size=" + in_world_s.value;
    url += "&seed=" + in_world_seed.value;
    
    // copy the text and alert the user
    navigator.clipboard.writeText(url);
    alert("URL copied to clipboard.");
}

// Window-load function
window.onload = function()
{
    // set up event listeners
    btn_run.addEventListener("click", game_run);
    btn_reset.addEventListener("click", game_reset);
    btn_step.addEventListener("click", game_step);
    btn_share.addEventListener("click", game_share);
    
    // start by loading default values
    in_world_w.value = 100;
    in_world_h.value = 100;
    in_world_s.value = 6;
    in_world_seed.value = new Date().getTime();

    // before choosing default values, see if the correct URL parameters
    // are present
    const params = new URLSearchParams(window.location.search);
    if (params.has("width"))
    { in_world_w.value = parseInt(params.get("width")); }
    if (params.has("height"))
    { in_world_h.value = parseInt(params.get("height")); }
    if (params.has("size"))
    { in_world_s.value = parseInt(params.get("size")); }
    if (params.has("seed"))
    { in_world_seed.value = parseInt(params.get("seed")); }
    
    // reset the game
    game_reset();
}

