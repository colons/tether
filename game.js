var game;
var ctx;

/* UTILITIES */
// XXX all this maths bullshit should be refactored into Point and Line
// objects. I'd suggest a Vector as well, but Vector would have the same
// interface as Point, so they may as well be the same object.

function somewhereJustOutsideTheViewport(buffer) {
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
}

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

function pointInPolygon(point, polygon) {
  var i, j;
  var c = 0;
  var numberOfPoints = polygon.length;
  for (i = 0, j = numberOfPoints-1; i < numberOfPoints; j = i++) {
    if (
      (((polygon[i].y <= point.y) && (point.y < polygon[j].y)) || ((polygon[j].y <= point.y) && (point.y < polygon[i].y))) &&
      (point.x < (polygon[j].x - polygon[i].x) * (point.y - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x)
    ) {
      c =!c;
    }
  }

  return c;
}

function vectorMagnitude(vector) {
  return Math.pow(Math.pow(vector.x, 2) + Math.pow(vector.y, 2), 1/2);
}

function vectorAngle(vector) {
  return Math.atan(vector.x, vector.y);
}

function linesFromPolygon(polygon) {
  // take a list of points [a, b, c, d] and convert it to a list of lines [[a, b], [b, c], [c, d]].
  var polyLine = [];
  for (var i = 1; i < polygon.length; i++) {
    polyLine.push([polygon[i - 1], polygon[i]]);
  }
  return polyLine;
}
function lineAngle(line) {
  return vectorAngle({
    x: line[1].x - line[0].x,
    y: line[1].y - line[0].y
  });
}

function lineDelta(line) {
  return forXAndY(line, function(a, b) {
    return b - a;
  });
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
  return linesFromPolygon([
    {x: 0, y: 0},
    {x:0, y: ctx.canvas.height},
    {x: ctx.canvas.width, y: ctx.canvas.height},
    {x: ctx.canvas.width, y: 0},
    {x: 0, y: 0}
  ]);
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

  self.journeySincePreviousFrame = function() {
    return [self.positionOnPreviousFrame, self.position];
  };

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
  self.mass = new Mass({
    radius: 5
  });
  
  self.locked = false;
  self.color = '#6666dd';

  // XXX strip out once we have proper spawning
  self.lastMousePosition = {x: 0, y: 0};
  self.lastUnlockedMousePosition = {x: 0, y: 0};

  self.draw = function() {
    ctx.fillStyle = self.color;
    ctx.beginPath();
    ctx.arc(self.mass.position.x, self.mass.position.y, self.mass.radius, 0, Math.PI*2);
    ctx.closePath();
    ctx.fill();
  };

  self.step = function() {
    if (!self.locked) {
      self.lastUnlockedMousePosition = self.lastMousePosition;
    }
    self.mass.setPosition(self.lastUnlockedMousePosition);
  };

  document.addEventListener('mousemove', function(e) {
    if (e.target === ctx.canvas) {
      self.lastMousePosition = {x: e.layerX, y: e.layerY};
    }
  });

  return true;
}

function Player(tether) {
  var self = this;
  self.mass = new Mass({
    mass: 50,
    lubricant: 0.99,
    radius: 10,
    walls: edgesOfCanvas()
  });

  self.color = '#6666dd';

  self.draw = function() {
    ctx.fillStyle = self.color;
    ctx.beginPath();
    ctx.arc(self.mass.position.x, self.mass.position.y, self.mass.radius, 0, Math.PI*2);
    ctx.closePath();
    ctx.fill();
  };

  self.step = function() {
    self.mass.force = forXAndY([tether.mass.position, self.mass.position], function(tpos, mpos) {
      return tpos - mpos;
    });

    self.mass.reactToForce();
  };

  self.die = function() {
    self.color = '#ff0000';
    tether.color = '#ff0000';
    game.end();
  };

  return true;
}

function Cable(tether, player) {
  var self = this;

  self.areaCoveredThisStep = function() {
    return [
      tether.mass.position,
      tether.mass.positionOnPreviousFrame,
      player.mass.positionOnPreviousFrame,
      player.mass.position
    ];
  };

  self.line = function() {
    return [tether.mass.position, player.mass.position];
  };

  self.draw = function() {
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(20, 20, 200, 1)';
    var line = self.line();
    ctx.moveTo(line[0].x, line[0].y);
    ctx.lineTo(line[1].x, line[1].y);
    ctx.stroke();
    ctx.closePath();

    self.drawAreaCoveredThisStep();
  };

  self.drawAreaCoveredThisStep = function() {
    ctx.beginPath();
    ctx.fillStyle = 'rgba(20, 200, 20, .5)';
    var areaCovered = self.areaCoveredThisStep();
    ctx.moveTo(areaCovered[0].x, areaCovered[0].y);

    for (var i = 1; i < areaCovered.length; i++) {
      ctx.lineTo(areaCovered[i].x, areaCovered[i].y);
    }

    ctx.lineTo(areaCovered[0].x, areaCovered[0].y);
    ctx.fill();
    ctx.closePath();
  };
}

/* ENEMIES */
function Ship(target, massOpts) {
  var self = this;
  self.mass = new Mass(massOpts);
  self.died = null;

  self.getTargetVector = function() {
    return forXAndY([target.mass.position, self.mass.position], function(them, us) {
      return them - us;
    });
  };

  self.step = function() {
    self.mass.reactToForce();
    if (self.mass.velocity == {x: 0, y: 0}) {
      self.destroy = true;
    }
  };

  self.die = function() {
    self.died = game.timeElapsed;
  };
}

function Idiot(target) {
  // A very stupid enemy. Basically the diamond from Geometry Wars.
  var self = this;
  var radius = 10;
  self.ship = new Ship(target, {
    mass: 1,
    lubricant: 0.9,
    radius: radius,
    position: somewhereJustOutsideTheViewport(radius)
  });

  self.deathDuration = 200;

  self.rgb = '100,100,0';

  self.draw = function() {
    var opacity;

    if (!self.ship.died) {
      opacity = 1;
    } else if (game.timeElapsed < (self.ship.died + self.deathDuration)) {
      opacity = 1 - ((game.timeElapsed - self.ship.died) / self.deathDuration);
    } else {
      opacity = 0;
    }

    ctx.fillStyle = 'rgba(' + self.rgb + ',' + opacity.toString() + ')';
    ctx.beginPath();
    ctx.arc(self.ship.mass.position.x, self.ship.mass.position.y, self.ship.mass.radius, 0, Math.PI*2);
    ctx.closePath();
    ctx.fill();
  };

  self.step = function() {
    if (!self.ship.died) {
      var targetVector = self.ship.getTargetVector();
      targetVectorMagnitude = vectorMagnitude(targetVector);
      self.ship.mass.force = forXAndY([targetVector], function(force) {
        return force * (1/targetVectorMagnitude);
      });
    } else {
      self.ship.mass.force = {x: 0, y: 0};
    }

    self.ship.step();
  };

  self.die = function() {
    self.rgb = '200,50,50';
    self.ship.mass.lubricant = 0.95;
    self.ship.die();
  };
}

function Twitchy() {
  // A hyperactive enemy, thrusting occasionally in the player's general direction.
  // XXX needs implemented
}


function Game() {
  var self = this;
  game = self;

  self.timeElapsed = 0;
  self.baseSpeed = 0.4;
  self.slowSpeed = self.baseSpeed / 100;
  self.speed = self.baseSpeed;

  var enemies = [];

  var tether = new Tether();
  var player = new Player(tether);
  var cable = new Cable(tether, player);

  window.addEventListener('mousedown', function() {
    ctx.canvas.classList.add('showcursor');
    tether.locked = true;
    self.speed = self.slowSpeed;
  });

  window.addEventListener('mouseup', function() {
    // XXX do not resume until the cursor is near the tether and if it is,

    if (!self.ended) {
      ctx.canvas.classList.remove('showcursor');
      tether.locked = false;
      self.speed = self.baseSpeed;
    }
  });

  self.step = function() {
    self.spawnEnemies();
    tether.step();
    player.step();

    for (var i = 0; i < enemies.length; i++) {
      enemies[i].step();
    }

    if (!self.ended) {
      self.checkForCableContact();
      self.checkForEnemyContact();
    }

    self.timeElapsed += self.speed;

    self.draw();
  };

  self.spawnEnemies = function() {
    if (Math.random() < 0.02 * game.speed) {
      enemies.push(new Idiot(player));
    }
  };

  self.checkForCableContact = function() {
    var cableAreaCovered = cable.areaCoveredThisStep();

    for (var i = 0; i < enemies.length; i++) {
      var enemy = enemies[i];
      if (enemy.ship.died) {
        continue;
      }

      var journey = enemy.ship.mass.journeySincePreviousFrame();
      var cableLines = linesFromPolygon(cableAreaCovered);

      for (var ci = 0; ci < cableLines.length; ci++) {
        var intersection = getIntersection(journey, cableLines[ci]);

        if (intersection.onLine1 && intersection.onLine2) {
          enemy.die();
          break;
        }
      }

      if (pointInPolygon(enemy.ship.mass.position, cableAreaCovered)) {
        enemy.die();
      }
    }
  };

  self.checkForEnemyContactWith = function(mass) {
    for (var i = 0; i < enemies.length; i++) {
      var enemy = enemies[i];
      if (enemy.ship.died) {
        continue;
      }

      if (
        vectorMagnitude(lineDelta([enemy.ship.mass.position, mass.position])) <
        (enemy.ship.mass.radius + mass.radius)
      ) {
        player.die();
      }
    }
  };

  self.checkForEnemyContact = function() {
    self.checkForEnemyContactWith(tether.mass);
    self.checkForEnemyContactWith(player.mass);
  };

  self.draw = function() {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = '#000';
    ctx.fillText(self.timeElapsed.toFixed(2), 6, 20);

    for (var i = 0; i < enemies.length; i++) {
      enemies[i].draw();
    }

    cable.draw();
    tether.draw();
    player.draw();
  };

  self.end = function() {
    ctx.canvas.classList.add('showcursor');
    self.ended = true;
    tether.locked = true;
    self.speed = self.slowSpeed;
  };

  return true;
}

/* FIRE */
initCanvas();
game = new Game();
setInterval(game.step, 10);
