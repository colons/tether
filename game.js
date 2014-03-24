var ctx;
var speed = 0.4;

function scaleCanvas() {
  ctx.canvas.width = window.innerWidth;
  ctx.canvas.height = window.innerHeight;
}

function initCanvas() {
  ctx = document.getElementById('game').getContext('2d');
  scaleCanvas();
  window.addEventListener('resize', scaleCanvas);
}

function forXAndY(obj1, obj2, func) {
  return {
    x: func(obj1.x, obj2.x),
    y: func(obj1.y, obj2.y)
  };
}

function Tether() {
  var self = this;
  self.position = {x: 0, y: 0};

  self.draw = function() {
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(self.position.x, self.position.y, 10, 0, Math.PI*2);
    ctx.closePath();
    ctx.fill();
  };

  document.addEventListener('mousemove', function(e) {
    if (e.target === ctx.canvas) {
      self.position = {x: e.layerX, y: e.layerY};
    }
  });

  return true;
}

function Mass() {
  // The basic object of our physics engine. An object with mass, position, velocity and forces.
  var self = this;
  self.velocity = {x: 0, y: 0};
  self.position = {x: 0, y: 0};
  self.force = {x: 0, y: 0};
  self.mass = 100;
  self.friction = 0.02;

  self.reactToVelocity = function () {
    // set position based on velocity
    self.position = forXAndY(self.position, self.velocity, function(pos, vel) {
      return pos + (vel * speed);
    });
  };

  self.reactToForce = function() {
    // set velocity and position based on force
    self.velocity = forXAndY(self.velocity, self.force, function(vel, force) {
      return (vel + (force / self.mass)) * (1 - (self.friction * speed));
    });
    self.reactToVelocity();
  };

  return true;
}


function Ship(tether) {
  var self = this;
  self.mass = new Mass();

  self.draw = function() {
    ctx.fillStyle = '#FF0000';
    ctx.beginPath();
    ctx.arc(self.mass.position.x, self.mass.position.y, 10, 0, Math.PI*2);
    ctx.closePath();
    ctx.fill();
  };

  self.move = function() {
    self.mass.force = forXAndY(tether.position, self.mass.position, function(tpos, mpos) {
      return tpos - mpos;
    });

    self.mass.reactToForce();
  };

  return true;
}

function Game() {
  var self = this;
  var tether = new Tether();
  var ship = new Ship(tether);

  self.draw = function() {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    ship.move();

    tether.draw();
    ship.draw();
  };

  return true;
}

initCanvas();
game = new Game();
setInterval(game.draw, 10);
