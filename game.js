var game;
var ctx;

/* UTILITIES */
// XXX all this maths bullshit should be refactored into Point and Line
// objects. I'd suggest a Vector as well, but Vector would have the same
// interface as Point, so they may as well be the same object.

function forXAndY(objs, func) {
  function getAttributeFromAllObjs(attr) {
    var attrs = [];
    for (var i = 0; i < objs.length; i++) {
      attrs.push(objs[i][attr]);
    }
    return attrs;
  }
  return {
    x: func.apply(null, getAttributeFromAllObjs('x')),
    y: func.apply(null, getAttributeFromAllObjs('y'))
  };
}

function getIntersection(line1, line2) {
  var denominator, a, b, numerator1, numerator2, result = {
    x: null,
    y: null,
    onLine1: false,
    onLine2: false
  };

  denominator =
    ((line2[1].y - line2[0].y) * (line1[1].x - line1[0].x)) -
    ((line2[1].x - line2[0].x) * (line1[1].y - line1[0].y));

  if (denominator === 0) {
    return result;
  }

  a = line1[0].y - line2[0].y;
  b = line1[0].x - line2[0].x;
  numerator1 = ((line2[1].x - line2[0].x) * a) - ((line2[1].y - line2[0].y) * b);
  numerator2 = ((line1[1].x - line1[0].x) * a) - ((line1[1].y - line1[0].y) * b);
  a = numerator1 / denominator;
  b = numerator2 / denominator;

  result.x = line1[0].x + (a * (line1[1].x - line1[0].x));
  result.y = line1[0].y + (a * (line1[1].y - line1[0].y));

  if (a > 0 && a < 1) {
    result.onLine1 = true;
  }
  if (b > 0 && b < 1) {
    result.onLine2 = true;
  }
  return result;
}

function angleOfLine(line) {
  var x = line[1].x - line[0].x;
  var y = line[1].y - line[0].y;
  return Math.atan(x/y);
}

/* SETUP */
function scaleCanvas() {
  ctx.canvas.width = window.innerWidth;
  ctx.canvas.height = window.innerHeight;
}

function initCanvas() {
  ctx = document.getElementById('game').getContext('2d');
  scaleCanvas();
  window.addEventListener('resize', scaleCanvas);
}

function edgesOfCanvas() {
  return [
    [{x: 0, y: 0}, {x:0, y: ctx.canvas.height}],
    [{x:0, y: ctx.canvas.height}, {x: ctx.canvas.width, y: ctx.canvas.height}],
    [{x: ctx.canvas.width, y: ctx.canvas.height}, {x: ctx.canvas.width, y: 0}],
    [{x: ctx.canvas.width, y: 0}, {x: 0, y: 0}]
  ];
}

/* GAME OBJECTS */
function Mass(opts) {
  // The basic object of our physics engine. A circle with mass, position, velocity and forces.
  var self = this;
  opts = opts || {};

  var defaults = {
    position: {x: 0, y: 0},
    velocity: {x: 0, y: 0},
    force: {x: 0, y: 0},
    mass: 1,
    lubricant: 1,
    radius: 0,
    walls: []
  };

  for (var attr in defaults) {
    var specified = opts[attr];
    if (specified === undefined) {
      self[attr] = defaults[attr];
    } else {
      self[attr] = specified;
    }
  }

  self.positionOnPreviousFrame = self.position;

  self.collideWithWalls = function () {
    for (var i = 0; i < self.walls.length; i++) {
      var wall = self.walls[i];
      // XXX move the wall towards us perpendicular to its direction by our radius
      var intersection = getIntersection(wall, [self.positionOnPreviousFrame, self.position]);

      if (intersection.onLine1 && intersection.onLine2) {
        // XXX bounce
        self.velocity = {x: 0, y: 0};
        self.position.x = intersection.x;
        self.position.y = intersection.y;
      }
    }
  };

  self.setPosition = function(position) {
    self.positionOnPreviousFrame = self.position;
    self.position = position;
  };

  self.reactToVelocity = function () {
    // set position based on velocity
    self.setPosition(forXAndY([self.position, self.velocity], function(pos, vel) {
      return pos + (vel * game.speed);
    }));
    self.collideWithWalls();
  };

  self.reactToForce = function() {
    // set velocity and position based on force
    var projectedVelocity = forXAndY([self.velocity, self.force], function(vel, force) {
      return vel + ((force * game.speed) / self.mass);
    });

    self.velocity = forXAndY([projectedVelocity], function(projected) {
      return projected * Math.pow(self.lubricant, game.speed);
    });

    self.reactToVelocity();
  };

  return true;
}

function Tether() {
  var self = this;
  self.mass = new Mass();

  self.draw = function() {
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(self.mass.position.x, self.mass.position.y, 10, 0, Math.PI*2);
    ctx.closePath();
    ctx.fill();
  };

  self.placeAtMouse = function() {
    self.mass.setPosition(self.lastMousePosition);
  };

  document.addEventListener('mousemove', function(e) {
    self.lastMousePosition = {x: e.layerX, y: e.layerY};

    if (game.speed === game.baseSpeed && e.target === ctx.canvas) {
      self.placeAtMouse();
    }
  });

  return true;
}

function Player(tether) {
  var self = this;
  self.mass = new Mass({
    mass: 50,
    lubricant: 0.99,
    walls: edgesOfCanvas()
  });

  self.draw = function() {
    ctx.fillStyle = '#FF0000';
    ctx.beginPath();
    ctx.arc(self.mass.position.x, self.mass.position.y, 10, 0, Math.PI*2);
    ctx.closePath();
    ctx.fill();
  };

  self.step = function() {
    self.mass.force = forXAndY([tether.mass.position, self.mass.position], function(tpos, mpos) {
      return tpos - mpos;
    });

    self.mass.reactToForce();
  };

  return true;
}

function Cable(tether, player) {
  var self = this;

  self.draw = function() {
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(20, 20, 200, 1)';
    ctx.moveTo(tether.mass.position.x, tether.mass.position.y);
    ctx.lineTo(player.mass.position.x, player.mass.position.y);
    ctx.stroke();
    ctx.closePath();
  };
}

/* ENEMIES */
function Ship(target, massOpts) {
  var self = this;
  self.mass = new Mass(massOpts);

  self.getTargetVector = function() {
    return forXAndY([target.mass.position, self.mass.position], function(them, us) {
      return them - us;
    });
  };

  self.somewhereJustOutsideTheViewport = function(buffer) {
    var somewhere = {
      x: Math.random() * ctx.canvas.width,
      y: Math.random() * ctx.canvas.height
    };

    var edgeSeed = Math.random();
    switch (true) {
      case edgeSeed < 0.25:
        somewhere.x = -buffer;
        break;
      case edgeSeed < 0.5:
        somewhere.x = ctx.canvas.width + buffer;
        break;
      case edgeSeed < 0.75:
        somewhere.y = -buffer;
        break;
      default:
        somewhere.y = ctx.canvas.height + buffer;
    }
    return somewhere;
  };

  self.step = function() {
    self.mass.reactToForce();
  };
}

function Idiot(target) {
  // A very stupid enemy. Basically the diamond from Geometry Wars.
  var self = this;
  self.ship = new Ship(target, {
    mass: 1,
    lubricant: 0.9,
    radius: 10
  });

  self.ship.mass.position = self.ship.somewhereJustOutsideTheViewport(self.ship.mass.radius);

  self.draw = function() {
    ctx.fillStyle = '#666600';
    ctx.beginPath();
    ctx.arc(self.ship.mass.position.x, self.ship.mass.position.y, self.ship.mass.radius, 0, Math.PI*2);
    ctx.closePath();
    ctx.fill();
  };

  self.step = function() {
    var targetVector = self.ship.getTargetVector();
    targetVectorMagnitude = Math.pow(Math.pow(targetVector.x, 2) + Math.pow(targetVector.y, 2), 1/2);
    self.ship.mass.force = forXAndY([targetVector], function(force) {
      return force * (1/targetVectorMagnitude);
    });
    self.ship.step();
  };
}

function Twitchy() {
  // A hyperactive enemy, thrusting occasionally in the player's general direction.
  // XXX needs implemented
}


function Game() {
  var self = this;
  game = self;

  self.baseSpeed = 0.4;
  self.slowSpeed = self.baseSpeed / 100;
  self.speed = self.baseSpeed;

  var enemies = [];

  var tether = new Tether();
  var player = new Player(tether);
  var cable = new Cable(tether, player);

  window.addEventListener('mousedown', function() {
    ctx.canvas.classList.add('showcursor');
    self.speed = self.slowSpeed;
  });

  window.addEventListener('mouseup', function() {
    // XXX do not resume until the cursor is near the tether and if it is,

    ctx.canvas.classList.remove('showcursor');
    tether.placeAtMouse();
    self.speed = self.baseSpeed;
  });

  self.step = function() {
    self.spawnEnemies();
    player.step();

    for (var i = 0; i < enemies.length; i++) {
      enemies[i].step();
    }

    self.draw();
  };

  self.spawnEnemies = function() {
    if (Math.random() < 0.02 * game.speed) {
      enemies.push(new Idiot(player));
    }
  };

  self.draw = function() {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    cable.draw();
    tether.draw();
    player.draw();

    for (var i = 0; i < enemies.length; i++) {
      enemies[i].draw();
    }
  };

  return true;
}

/* FIRE */
initCanvas();
game = new Game();
setInterval(game.step, 10);
