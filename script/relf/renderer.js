// Renderer class. Takes in a CAWorld and a canvas and brings it to life using
// pixi.js.
class Renderer
{
    // Constructor. Takes in the canvas and the world and initializes the
    // pixi.js rendering system. I took at lot of these ideas from the
    // creator of the cellauto JS library. Here's a link to the repository:
    // https://github.com/sanojian/cellauto
    constructor(world, canvas)
    {
        this.world = world;
        this.canvas = canvas;
        this.textures = [];
        this.cells = [];

        // set up the canvas' dimensions
        this.canvas.width = this.world.width * this.world.cellSize;
        this.canvas.height = this.world.height * this.world.cellSize;

        // create a pixi.js renderer and a stage
        this.renderer = new PIXI.autoDetectRenderer(this.canvas.width,
                                                    this.canvas.height,
                                                    this.canvas,
                                                    null,
                                                    true);
        this.stage = new PIXI.Stage(0xFFFFFF);
        
        // -------------------------- Color Setup --------------------------- //
        // set up a second canvas to convert our world color palette to pixi.js
        // textures
        const tc = document.createElement("canvas");
        tc.width = this.world.cellSize * this.world.palette.length;
        tc.height = this.world.cellSize;
        const tctx = tc.getContext("2d");
       
        // for each color in our palette, set the context's fill style and fill
        // a rectangle with the correct color
        for (let i = 0; i < this.world.palette.length; i++)
        {
            tctx.fillStyle = "rgba(" + world.palette[i] + ")";
            tctx.fillRect(i * this.world.cellSize, 0,
                          this.world.cellSize,
                          this.world.cellSize);
        }

        // now, with the second color canvas, we'll create individual pixi.js
        // textures to pull from later
        const bt = new PIXI.BaseTexture.fromCanvas(tc);
        for (let i = 0; i < this.world.palette.length; i++)
        {
            const tr = new PIXI.Rectangle(i * this.world.cellSize,
                                          0,
                                          this.world.cellSize,
                                          this.world.cellSize);
            this.textures.push(new PIXI.Texture(bt, tr));
        }
    }

    // Main drawing function. Uses pixi.js to draw the world on the renderer's
    // canvas element. Call this once, then call 'refresh()' after each step of
    // the game world.
    draw()
    {
        // first, attempt to remove the old 'children' from the stage
        try
        { this.stage.removeChildren(); }
        catch (ex)
        { console.log("Failed to remove children from stage: " + ex); }

        // next, iterate across the world and add a sprite (child) for each cell
        for (let x = 0; x < this.world.width; x++)
        {
            for (let y = 0; y < this.world.height; y++)
            {
                const sprite = new PIXI.Sprite(this.textures[0]);
                // store the sprite in our 'cells' array in such a way that we
                // *don't* need a 2-dimensional array. Just a clever indexing
                // strategy. Then, update the sprite's location and add it to
                // the pixi stage.
                this.cells[x + (y * this.world.width)] = sprite;
                sprite.x = x * this.world.cellSize;
                sprite.y = y * this.world.cellSize;
                this.stage.addChild(sprite);
            }
        }
        
        // render the pixi stage
        this.renderer.render(this.stage);
    }
    
    // Used to redraw the pixi stage when only a few things have changed.
    refresh()
    {
        for (let x = 0; x < this.world.width; x++)
        {
            for (let y = 0; y < this.world.height; y++)
            {
                // retrieve the current cell's color and update the appropraite
                // pixi cell entry if needed
                const c = this.world.grid[y][x].getColor();
                if (c !== this.world.grid[y][x].oldColor)
                {
                    this.cells[x + (y * this.world.width)].setTexture(this.textures[c]);
                    this.world.grid[y][x].oldColor = c;
                }
            }
        }

        // render the stage with the changes
        this.renderer.render(this.stage);
    }
}

