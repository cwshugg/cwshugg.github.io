// RELF - REctangular LifeForms.

// ================================ Globals ================================= //
// The world's color palette.
const palette = [
    "0,   0,   0,   1",     // black
    "255, 255, 255, 1",     // white
    "40,  40,  45,  1",     // grayish (empty cell color)
    "140, 123, 84,  1",     // brownish (nomad)
    "210, 129, 7,   1",     // gold-yellow (settler)
    "180, 17,  33,  1",     // red (hunter)
    "233, 18,  153, 1",     // red-pink (warlock)
    "240, 224, 32,  1",     // yellow (noble)
];

// Enum-of-sorts to match indexes to colors in the palette.
const colors = {
    C_BLACK: 0,
    C_WHITE: 1,
    C_EMPTY: 2,
    C_NOMAD: 3,
    C_SETTLER: 4,
    C_HUNTER: 5,
    C_WARLOCK: 6,
    C_NOBLE: 7
};

// Temporary world used for accessing internal fields (such as directions).
const _world = new CAWorld({
    width: 1,
    height: 1,
    cellSize: 1
});

// Enum-of-sorts of CAWorld directional indexes.
const directions = {
    TOPLEFT: _world.TOPLEFT.index,
    TOP: _world.TOP.index,
    TOPRIGHT: _world.TOPRIGHT.index,
    LEFT: _world.LEFT.index,
    RIGHT: _world.RIGHT.index,
    BOTTOMLEFT: _world.BOTTOMLEFT.index,
    BOTTOM: _world.BOTTOM.index,
    BOTTOMRIGHT: _world.BOTTOMRIGHT.index
};
// Array version of directions.
const directions_array = [
    _world.TOPLEFT.index,
    _world.TOP.index,
    _world.TOPRIGHT.index,
    _world.LEFT.index,
    _world.RIGHT.index,
    _world.BOTTOMLEFT.index,
    _world.BOTTOM.index,
    _world.BOTTOMRIGHT.index
];

// Direct directions.
const directions_direct = [
    directions.TOP,
    directions.LEFT,
    directions.RIGHT,
    directions.BOTTOM
];

// Indirect/diagonal directions.
const directions_indirect = [
    directions.TOPLEFT,
    directions.TOPRIGHT,
    directions.BOTTOMLEFT,
    directions.BOTTOMRIGHT
];

// Adjacencies.
const adjacents = [
    [directions.TOP, [directions.TOPLEFT, directions.TOPRIGHT], [directions.LEFT, directions.RIGHT]],
    [directions.LEFT, [directions.BOTTOMLEFT, directions.TOPLEFT], [directions.TOP, directions.BOTTOM]],
    [directions.RIGHT, [directions.TOPRIGHT, directions.BOTTOMRIGHT], [directions.TOP, directions.BOTTOM]],
    [directions.BOTTOM, [directions.BOTTOMLEFT, directions.BOTTOMRIGHT], [directions.LEFT, directions.RIGHT]],
    [directions.TOPLEFT, [directions.LEFT, directions.TOP], []],
    [directions.TOPRIGHT, [directions.RIGHT, directions.TOP], []],
    [directions.BOTTOMLEFT, [directions.LEFT, directions.BOTTOM], []],
    [directions.BOTTOMRIGHT, [directions.RIGHT, directions.BOTTOM], []]
];

// Random seed.
let rseed = 4581261973;

// ================================ Helpers ================================= //
// Sets the global random seed.
function seed_rand(seed)
{
    rseed = seed;
}

// Pseudo seeded random generator, used as a replacement for Math.random().
function rand_seed(seed)
{
    const val = (Math.sin(seed) * 4927) + (Math.cos(seed) * 5389);
    return val - Math.floor(val);
}

// Non-seeded version of rand_seed.
function rand()
{ return rand_seed(rseed++); }

// Generates and returns a random integer in the given range (inclusive).
function rand_int(min, max)
{ return rand_int_seed(min, max, rseed++); }

// Seeded version of rand_int.
function rand_int_seed(min, max, seed)
{ return Math.floor(rand(seed) * (max - min) + min); }

// Generates a random hexidecimal string.
function rand_hexstr()
{ return rand(rseed++).toString(16).substr(2, 14); }

// Takes in a numerator and denominator (ex: 1 / 100) and computes random chance
// based on the given odds. Returns true if the chance succeeded, and false if
// it failed.
function rand_chance(n, d)
{
    // generate a random integer between zero and the denominator, then return
    // true if it landed *under* the numerator
    const val = rand_int(0, d - 1);
    return val < n;
}

// Creates and returns an array containing the sequential indexes from 'min' to
// 'max', in order. 'min' and 'max' are included in the array.
function range_array(min, max)
{
    return Array(max - min + 1).fill().map((_, idx) => min + idx);
}

// Takes in an array and shuffles it with the global seed.
// https://stackoverflow.com/questions/16801687/javascript-random-ordering-with-seed
function shuffle_array(array)
{
    let m = array.length;
    
    // iterate until all values have been shuffled
    while (m > 0)
    {
        // pick a random index
        const idx = Math.floor(rand(rseed) * m--);

        // swap with the current element
        const tmp = array[m];
        array[m] = array[idx];
        array[idx] = tmp;
        rseed++;
    }
    return array;
}

// Helper function for all relves that iterates through their current neighbors
// (given as an argument) and sorts them into a JSON object formatted like so:
//      {
//          "empty": [],
//          "nomads": [],
//          "settlers": [],
//          ...
//      }
// Where each array is filled with the neighbors that match that relf type.
function sort_neighbors(neighbors)
{
    result = {
        "empties": [],
        "nomads": [],
        "settlers": [],
        "hunters": [],
        "warlocks": [],
        "nobles": []
    };

    // iterate across all neighbors and place them in the correct 'bins'
    for (let i = 0; i < neighbors.length; i++)
    {
        // skip if the neighbor is null
        let n = neighbors[i];
        if (!n)
        { continue; }

        if (n.relf instanceof Nomad)            // NOMADS
        { result.nomads.push(n); }
        else if (n.relf instanceof Settler)     // SETTLERS
        { result.settlers.push(n); }
        else if (n.relf instanceof Hunter)      // HUNTER
        { result.hunters.push(n); }
        else if (n.relf instanceof Warlock)     // WARLOCK
        { result.warlocks.push(n); }
        else if (n.relf instanceof Noble)       // NOBLE
        { result.nobles.push(n); }
        else if (n.relf instanceof Empty)       // EMPTY CELLS
        { result.empties.push(n); }
    }
    
    return result;
}

// Takes in the relf, its neighbors, and a location index to which the relf will
// move, and attempts to swap the relf with the neighboring cell in the correct
// direction.
// Returns null if the move couldn't happen (if no cell exists in the given
// direction or if the cell is already filled), or the neighbor object that was
// swapped with the relf on success.
function move_relf(r, nbs, dir)
{
    // get the neighbor and make sure it's not null
    n = nbs[dir];
    if (!n)
    { return null; }

    // determine if the neighbor is an empty cell. If it is, we'll swap them
    if (n.relf instanceof Empty)
    {
        // generate two copies
        const new_empty = n.relf.copy();
        const new_relf = r.copy();

        // update the neighbor and return r's new object
        n.relf = new_relf;
        return new_empty;
    }

    return null;
}

// Takes in a Relf's class constructor and creates a Relf instance whose
// 'processed' field is set to true.
function replacement_relf(construct)
{
    const relf = new construct();
    relf.processed = true;
    return relf;
}

// Special case of 'replacement_relf' that returns an Empty relf object.
function empty_relf()
{
    return replacement_relf(Empty);
}

// Returns true if the neighbor is an Empty cell, and false otherwise.
function neighbor_is_empty(neighbor)
{
    return neighbor && neighbor.relf instanceof Empty;
}


// ============================== Relf Classes ============================== //
// The base relf class acts as a parent to othe relves.
class Relf
{
    // Constructor. Sets up all internal fields.
    constructor()
    {
        this.name = rand_hexstr();      // randomly-generated name
        this.age = 0;                   // a relf's age increases after each step
        this.color = colors.C_EMPTY;    // each relf has a corresponding color
        this.processed = false;         // flag for if the relf has been processed
    }
    
    // Copies this relf's internal data to another new instance.
    copy()
    {
        const relf = new this.constructor();
        relf.name = "" + this.name;
        relf.age = this.age;
        relf.processed = this.processed;
        return relf;
    }
    
    // Increases the relf's age.
    increase_age()
    {
        this.age++;
    }
    
    // Implementation of anything that must be done before each world step.
    // This is called directly from cellauto lib's 'reset' function.
    reset(cell)
    {
        this.processed = false;
    }

    // Implementation of a relf's behavior in a single step of the world. This
    // is called directly from the cellauto lib's 'process' function, and is
    // passed the same list of neighboring cells.
    // Returns the relf that should be assigned to the current cell. (It can be
    // 'this' (i.e. the same relf) or it can be a different/new relf.)
    process(neighbors)
    {
        this.increase_age();
        return this;
    }
}

// A lifeless version of a relf used to represent an empty cell.
class Empty extends Relf
{
    // Constructor.
    constructor()
    {
        super();
        this.name = null;
        this.age = -1;
        this.color = colors.C_EMPTY;
    }
}

// The Nomad is the first basic type of relf. It favors wandering.
class Nomad extends Relf
{
    // Constructor.
    constructor()
    {
        super();
        this.color = colors.C_NOMAD;
        this.change_direction();
    }
    
    // Nomads move a certain number of steps in one direction, then choose a
    // different direction. This function chooses a new direction.
    change_direction()
    {
        this.direction = directions_array[rand_int(0, directions_array.length - 1)];
        this.direction_steps = rand_int(2, 16);
    }
    
    // Overridden copy method.
    copy()
    {
        const nomad = super.copy();
        nomad.direction = this.direction;
        nomad.direction_steps = this.direction_steps;
        return nomad;
    }

    // Function that moves the nomad a single location. Called within the
    // nomad's process() function.
    move(neighbors)
    {
        // change direction if it's time
        if (this.direction_steps == 0)
        { this.change_direction(); }
        
        // try to move somewhere
        let nr = null;
        let tries = 8; // try a maximum number of times
        while (!nr && tries > 0)
        {
            // attempt to move in the current direction
            this.direction_steps--; // decrease so the value copies over
            nr = move_relf(this, neighbors, this.direction);
            if (nr)
            {
                this.direction_steps--;
                return nr;
            }

            // if moving failed, change directions
            this.direction_steps++; // move failed, re-increase
            this.change_direction();
            tries--;
        }
        return this;
    }
    
    // Overridden process method.
    process(neighbors)
    {
        // if this one has already been processed, don't proceed
        if (this.processed)
        { return this; }
        this.processed = true;

        super.process(neighbors);
        const nbs = sort_neighbors(neighbors);

        // NOMAD RULE 1: if the nomad has TWO other nomad neighbors, it will
        // become a SETTLER.
        const old_enough_to_settle = this.age >= 10;
        if (nbs.nomads.length == 2 && old_enough_to_settle)
        { return replacement_relf(Settler); }

        // NOMAD RULE 2: if the nomad has ONE OR TWO neighboring settlers, it
        // will also become a SETTLER.
        // If a nomad encounters *too many* settlers, it will feel overwhelmed
        // and will choose not to become a settler.
        if (nbs.settlers.length <= 2 && nbs.settlers.length > 0 &&
            old_enough_to_settle)
        { return replacement_relf(Settler); }

        // NOMAD RULE 3: if the nomad is completely surrounded by settlers, it
        // will revolt and become a hunter
        if (nbs.settlers.length == neighbors.length)
        { return replacement_relf(Hunter); }

        // if it can't move anywhere, do nothing else
        if (nbs.empties.length == 0)
        { return this; }

        // if no other rules apply above, the nomad will move once, if it can
        return this.move(neighbors);        
    }
}

// Settlers are created when nomads band together. They favor sticking together.
class Settler extends Relf
{
    // Constructor.
    constructor()
    {
        super();
        this.color = colors.C_SETTLER;
        
        // assign random age thresholds
        this.reproduce_age = rand_int(20, 200);
        this.corruption_age = rand_int(1500, 2500);
        
        // settlers have a random chance that they'll reproduce a hunter instead
        // of a nomad
        this.reproduce_hunter_chance = [rand_int(1, 10), 100];
    }
    
    // Overridden copy method.
    copy()
    {
        const relf = super.copy();
        relf.reproduce_age = this.reproduce_age;
        relf.corruption_age = this.corruption_age;
        return relf;
    }

    // Settlers like to get closer to other settlers. This function takes in a
    // settlers neighbor list and attempts to move it closer to other settlers.
    snuggle(neighbors)
    {
        // count direct (left/right/up/down) and indirect neighbors
        let direct_neighbors = 0;
        let indirect_neighbors = 0;
        const snbs = [false, false, false, false, false, false, false, false];
        for (let i = 0; i < directions_array.length; i++)
        {
            const n = neighbors[directions_array[i]];
            if (n && n.relf instanceof Settler)
            {
                snbs[directions_array[i]] = true;
                // tally direct and indirect neighbors
                if (directions_direct.includes(directions_array[i]))
                { direct_neighbors++; }
                if (directions_indirect.includes(directions_array[i]))
                { indirect_neighbors++; }
            }
        }

        // if we already have one or more direct neighbors, we're satisfied
        if (direct_neighbors >= 2)
        { return null; }

        // otherwise, we'll try wiggling, as long as we would still have an
        // indirect or direct neighbor (using the global 'adjacents' list in a
        // random order.)
        let aidxs = range_array(0, adjacents.length - 1);
        aidxs = shuffle_array(aidxs);
        for (let i = 0; i < aidxs.length; i++)
        {
            // extract the data from the array index
            const adj = adjacents[aidxs[i]];
            const move_to = adj[0];
            const move_dneighbors = adj[1];
            const move_ineighbors = adj[2];

            // if the neighbor isn't empty, this move isn't possible
            if (!neighbor_is_empty(neighbors[move_to]))
            { continue; }

            // determine how many direct settler neighbors we would have
            let direct_move_neighbors = 0;
            let indirect_move_neighbors = 0;
            for (let j = 0; j < move_dneighbors.length; j++)
            {
                const n = neighbors[move_dneighbors[j]];
                if (n && n.relf instanceof Settler)
                { direct_move_neighbors++; }
            }
            for (let j = 0; j < move_ineighbors.length; j++)
            {
                const n = neighbors[move_ineighbors[j]];
                if (n && n.relf instanceof Settler)
                { indirect_move_neighbors++; }
            }

            // finally, if we would have more direct neighbors by moving, we'll
            // do it. Otherwise, we won't
            if (direct_move_neighbors > direct_neighbors)
            {
                const result = move_relf(this, neighbors, move_to);
                if (result)
                { return result; }
            }
        }
        return null;
    }

    // Function that attempts to try to spawn a new relf next to this settler.
    // Returns true or false, depending on if the reproduction was successful.
    reproduce(neighbors)
    {
        // we'll make a list of random indexes
        let idxs = range_array(0, neighbors.length);
        idxs = shuffle_array(idxs);

        // iterate across each neighbor and look for the first empty spot we
        // can use to place a new nomad
        for (let i = 0; i < idxs.length; i++)
        {
            const n = neighbors[idxs[i]];
            if (neighbor_is_empty(n))
            {
                // the settler has a chance to reproduce a hunter instead of a
                // nomad. Run the numbers here
                const c = this.reproduce_hunter_chance;
                if (rand_chance(c[0], c[1]))
                { n.relf = replacement_relf(Hunter); }
                else
                { n.relf = replacement_relf(Nomad); }
                return true;
            }
        }
        return false;
    }

    // Overridden process.
    process(neighbors)
    {
        // only process once!
        if (this.processed)
        { return this; }
        this.processed = true;
        
        // invoke the parent then sort the neighbors
        super.process(neighbors);
        const nbs = sort_neighbors(neighbors);

        // SETTLER RULE 1: if a settler has no other neighboring settlers, it
        // will die
        if (nbs.settlers.length == 0)
        { return empty_relf(); }

        // SETTLER RULE 2: if a settler can move to a spot to get more "direct"
        // neighbors (i.e. directly left/right/up/down), it will
        if (nbs.settlers.length >= 1)
        {
            // count the direct and indirect neighbors
            const result = this.snuggle(neighbors);
            if (result)
            { return result; }
        }

        // SETTLER RULE 3: if a settler has exactly three neighbors, and its age
        // is appropriate, it will reproduce and create a new nomad in an empty
        // cell (if possible)
        const can_reproduce = this.age >= this.reproduce_age;
        const does_reproduce = rand_chance(1, 150);
        if (nbs.settlers.length == 3 && can_reproduce && does_reproduce)
        {
            const result = this.reproduce(neighbors);
            if (result)
            { return this; }
        }

        // SETTLER RULE 4: if a settler has passed its corruption age, it will
        // become a hunter
        if (this.corruption_age > -1 && this.age >= this.corruption_age)
        { return replacement_relf(Hunter); }

        // SETTLER RULE 5: a settler may turn into a noble (the more neighbors
        // it has, the better the chance)
        const noble_chance = [nbs.settlers.length, 20000];
        if (rand_chance(noble_chance[0], noble_chance[1]))
        { return replacement_relf(Noble); }

        return this;
    }
}

// Nobles are like settlers, but they do not succumb to corruption and are more
// resistant to hunters.
class Noble extends Settler
{
    // Constructor.
    constructor()
    {
        super();
        this.color = colors.C_NOBLE;

        // nobles have a number of hitpoints
        this.hp = rand_int(2, 3);

        // nobles don't corrupt and do not reproduce to create hunters
        this.corruption_age = -1;
        this.reproduce_hunter_chance = [0, 100];
    }
    
    // Overridden copy method.
    copy()
    {
        const relf = super.copy();
        relf.hp = this.hp;
        return relf;
    }
}

// Hunters move like nomads, but kill settlers when they encounter them.
class Hunter extends Nomad
{
    // Constructor.
    constructor()
    {
        super();
        this.color = colors.C_HUNTER;
        this.hp = rand_int(1, 12);
        this.kills = 0;
        
        // at some point, a hunter will calm back down and turn into a nomad
        this.calming_age = rand_int(1000, 2000);
    }

    // Overridden copy method.
    copy()
    {
        const relf = super.copy();
        relf.hp = this.hp;
        relf.kills = this.kills;
        relf.calming_age = this.calming_age;
        return relf;
    }
    
    // Invoked when the hunter loses one HP from an encounter.
    // Returns a new Empty relf if the hunter ran out of HP, or null if the
    // hunter is still alive.
    take_hit()
    {
        this.hp--;
        // if its HP is down to zero, it dies
        if (this.hp == 0)
        { return replacement_relf(Empty); }
        return null;
    }
    
    // Invoked when a relf is killed by the hunter.
    kill_relf(neighbor)
    {
        // first, check if the relf is a noble that has more than 1 HP
        if (neighbor.relf instanceof Noble && neighbor.relf.hp > 1)
        { neighbor.relf.hp--; }
        else
        {
            // otherwise, kill the relf and move on
            neighbor.relf = empty_relf();
            this.kills++;
        }
    }

    // Overridden process method.
    process(neighbors)
    {
        // only process once!
        if (this.processed)
        { return this; }
        this.processed = true;
        
        // sort the neighbors
        this.increase_age();
        const nbs = sort_neighbors(neighbors);

        // HUNTER RULE 1: if at least one settler is nearby, kill one and lose
        // one HP in the process
        if (nbs.settlers.length >= 1 || nbs.nobles.length >= 1)
        {
            // build an array of settlers and nobles for the hunter to choose
            // from
            const targets = [];
            for (let i = 0; i < nbs.settlers.length; i++)
            { targets.push(nbs.settlers[i]); }
            for (let i = 0; i < nbs.nobles.length; i++)
            { targets.push(nbs.nobles[i]); }
            
            // choose a random index to attack
            const sidx = rand_int(0, targets.length - 1);
            this.kill_relf(targets[sidx]);
            
            // take some damage, and return appropriately
            const result = this.take_hit();
            if (result)
            { return result; }
            return this;
        }

        // HUNTER RULE 2: at some point, it will turn back into a nomad when it
        // reaches its calming age
        if (this.age >= this.calming_age)
        { return replacement_relf(Nomad); }
        
        // HUNTER RULE 3: the hunter may transform into a warlock at any moment,
        // especially if it has already killed at least once
        const warlock_chance = [1, 20000 + (this.age * 2)];
        if (this.kills > 0) { warlock_chance[0]++; }
        if (rand_chance(warlock_chance[0], warlock_chance[1]))
        { return replacement_relf(Warlock); }

        return this.move(neighbors);
    }
}

// Warlocks move like hunters but have extra, malicious, abilities.
class Warlock extends Relf
{
    // Constructor.
    constructor()
    {
        super();
        this.color = colors.C_WARLOCK;
        this.hp = rand_int(6, 24);
        
        // warlocks will use magic to summon hunters around it. It will do
        // this a fixed number of times in its lifetime
        const burst_count = rand_int(1, 4);
        this.burst_ages = range_array(0, burst_count - 1);
        this.burst_ages[0] = rand_int(10, 100);
        for (let i = 1; i < burst_count; i++)
        {
            // we'll compute the next burst age's range so it's guaranteed to
            // be above the previous one
            const low = this.burst_ages[i - 1] + 1;
            const high = low + rand_int(100, 300);
            this.burst_ages[i] = rand_int(low, high);
        }
    }
        
    // Overridden copy method.
    copy()
    {
        const relf = super.copy();
        relf.burst_ages = this.burst_ages;
        return relf;
    }
    
    // The warlock's "burst" method. Spawns hunters surrounding the warlock.
    burst(neighbors)
    {
        // iterate through each neighbor, replacing any empty squares with new
        // hunters created by the warlock's "magic"
        for (let i = 0; i < neighbors.length; i++)
        {
            if (neighbor_is_empty(neighbors[i]))
            { neighbors[i].relf = replacement_relf(Hunter); }
        }
    }

    // Overridden process function.
    process(neighbors)
    {
        if (this.processed)
        { return this; }
        this.processed = true;

        this.increase_age();
        const nbs = sort_neighbors(neighbors);

        // WARLOCK RULE 1: if the age is correct, the warlock will produce a
        // magical *burst* that will create hunters around it
        if (this.age == this.burst_ages[0])
        {
            this.burst_ages.shift();    // pop the first entry
            this.burst(neighbors);      // spawn hunters

            // if that was the last burst, the warlock dies
            if (this.burst_ages.length == 0)
            { return empty_relf(); }
        }
        
        return this;
    }
}


// ========================== World Initialization ========================== //
// Initializes and returns the world.
function world_init(width, height, cell_size)
{
    // initialize the world with the given dimensions and the global palette
    const world = new CAWorld({
        width: width,
        height: height,
        cellSize: cell_size
    });
    world.palette = palette;
    
    // all cells in the world will be of type 'relf', but they'll have different
    // internal Relf objects that define their appearance/actions
    world.registerCellType("relf", {
        getColor: function()                // color retrieval
        { return this.relf.color; },
        reset: function()                   // pre-step reset
        { this.relf.reset(this); },
        process: function(neighbors)        // step-by-step processing
        {
            const new_relf = this.relf.process(neighbors);
            this.relf = new_relf;
        },
    }, function()                           // initialization
    {
        const r = rand_int(0, 1000);

        // use the random number to decide what kind of relf this will be
        if (r < 20)
        { this.relf = new Nomad(); }
        else if (r >= 20 && r < 25)
        { this.relf = new Settler(); }
        else if (r >= 30 && r < 32)
        { this.relf = new Hunter(); }
        else
        { this.relf = new Empty(); }
    });

    
    // fill the world with relves
	world.initialize([
		{ name: "relf", distribution: 100 }
	]);

	return world;
}

