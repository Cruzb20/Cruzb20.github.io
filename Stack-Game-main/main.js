window.focus(); // Capture keys right away (by default focus is on editor)

window.addEventListener("mousedown", eventHandler);
window.addEventListener("touchstart", eventHandler);
window.addEventListener("keydown", function (event) {
  if (event.key === " " || event.key === "Spacebar" ) {
    event.preventDefault();
    eventHandler();
  }
  if (event.key === "R" || event.key === "r") {
    event.preventDefault();
    startGame();
  }
});

function eventHandler(event) {
  if (event.type === "touchstart" && isMobileDevice()) {
    event.preventDefault();

    if (event.touches.length > 0) {
      const touch = event.touches[0];
      const touchX = touch.clientX;

      const screenWidth = window.innerWidth;
      const clickOffset = touchX / screenWidth * 2 - 1;
      const clickDirection = clickOffset > 0 ? "x" : "z";

      const topLayer = stack[stack.length - 1];
      const previousLayer = stack[stack.length - 2];

      const direction = topLayer.direction;
      const size = direction === "x" ? topLayer.width : topLayer.depth;
      const delta =
        topLayer.threejs.position[direction] -
        previousLayer.threejs.position[direction];
      const overhangSize = Math.abs(delta);
      const overlap = size - overhangSize;

      if (overlap > 0 && clickDirection === direction) {
        cutBox(topLayer, overlap, size, delta);
      } else {
        missedTheSpot();
      }
    }
  } else if (event.type === "mousedown" && !isMobileDevice()) {
    event.preventDefault();

    const screenWidth = window.innerWidth;
    const clickOffset = event.clientX / screenWidth * 2 - 1;
    const clickDirection = clickOffset > 0 ? "x" : "z";

    const topLayer = stack[stack.length - 1];
    const previousLayer = stack[stack.length - 2];

    const direction = topLayer.direction;
    const size = direction === "x" ? topLayer.width : topLayer.depth;
    const delta =
      topLayer.threejs.position[direction] -
      previousLayer.threejs.position[direction];
    const overhangSize = Math.abs(delta);
    const overlap = size - overhangSize;

    if (overlap > 0 && clickDirection === direction) {
      cutBox(topLayer, overlap, size, delta);
    } else {
      missedTheSpot();
    }
  }
}

function isMobileDevice() {
  return /Mobi|Android/i.test(navigator.userAgent);
}


// Add event listener to the restart button
const restartButton = document.getElementById("restart-button");
restartButton.addEventListener("click", startGame);
// Add touch event listener to the restart button for mobile devices
restartButton.addEventListener("touchstart", startGame);

let camera, scene, renderer; // ThreeJS globals
let world; // CannonJs world
let lastTime; // Last timestamp of animation
let stack; // Parts that stay solid on top of each other
let overhangs; // Overhanging parts that fall down
const boxHeight = 1; // Height of each layer
const originalBoxSize = 3; // Original width and height of a box
let autopilot;
let gameEnded;
let robotPrecision; // Determines how precise the game is on autopilot
let isGameOver = false; // Add a variable to track game over state

const scoreElement = document.getElementById("score");
const instructionsElement = document.getElementById("instructions");
const resultsElement = document.getElementById("results");
const highestScoreElement = document.getElementById("highestscore");

// Initialize the highest score from local storage or set it to 0 if it doesn't exist
let highestScore = localStorage.getItem("highestscore") || 0;
highestScoreElement.innerText = highestScore;

// Update the highest score
function updateHighestScore(score) {
  if (score > highestScore) {
    highestScore = score;
    localStorage.setItem("highestscore", highestScore);
    highestScoreElement.innerText = highestScore;
  }
}

init();

// Determines how precise the game is on autopilot
function setRobotPrecision() {
  robotPrecision = Math.random() * 1 - 0.5;
}

// Replace the init() function with the modified one 
function init() {
  autopilot = true;
  gameEnded = false;
  lastTime = 0;
  stack = [];
  overhangs = [];
  setRobotPrecision();

  world = new CANNON.World();
  world.gravity.set(0, -10, 0);
  world.broadphase = new CANNON.NaiveBroadphase();
  world.solver.iterations = 40;

  const aspect = window.innerWidth / window.innerHeight;
  const width = 10;
  const height = width / aspect;

  camera = new THREE.OrthographicCamera(
    width / -2,
    width / 2,
    height / 2,
    height / -2,
    0,
    100
  );

  camera.position.set(4, 4, 4);
  camera.lookAt(0, 0, 0);

  scene = new THREE.Scene();

  addLayer(0, 0, originalBoxSize, originalBoxSize);
  addLayer(-10, 0, originalBoxSize, originalBoxSize, "x");

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
  dirLight.position.set(10, 20, 0);
  scene.add(dirLight);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setAnimationLoop(animation);
  document.body.appendChild(renderer.domElement);

  renderer.setClearColor("#00FA9A", 1);

  // Initialize the highest score and display it
  highestScore = parseInt(localStorage.getItem("highestScore")) || 0;
  highestScoreElement.innerText = highestScore;
}

let isGameOverSoundPlayed = false; // Variable to track if game over sound has been played
function startGame() {
  autopilot = false;
  gameEnded = false;
  isGameOver = false; // Reset the game over state
  lastTime = 0;
  stack = [];
  overhangs = [];

  if (instructionsElement) instructionsElement.style.display = "none";
  if (resultsElement) resultsElement.style.display = "none";
  if (scoreElement) scoreElement.innerText = 0;

  if (world) {
    // Remove every object from world
    while (world.bodies.length > 0) {
      world.remove(world.bodies[0]);
    }
  }
  if (scene) {
    // Remove every Mesh from the scene
    while (scene.children.find((c) => c.type == "Mesh")) {
      const mesh = scene.children.find((c) => c.type == "Mesh");
      scene.remove(mesh);
    }

    // Foundation
    addLayer(0, 0, originalBoxSize, originalBoxSize);

    // First layer
    addLayer(-10, 0, originalBoxSize, originalBoxSize, "x");
  }

  if (camera) {
    // Reset camera positions
    camera.position.set(4, 4, 4);
    camera.lookAt(0, 0, 0);
  }

  if (scoreElement) scoreElement.innerText =0; // Reset the score to 0
  updateHighestScore(0); // Update the highest score to 0
  isGameOverSoundPlayed = false; // Reset the game over sound played flag
}

function addLayer(x, z, width, depth, direction) {
  const y = boxHeight * stack.length; // Add the new box one layer higher
  const layer = generateBox(x, y, z, width, depth, false);
  layer.direction = direction;
  stack.push(layer);
}

function addOverhang(x, z, width, depth) {
  const y = boxHeight * (stack.length - 1); // Add the new box one the same layer
  const overhang = generateBox(x, y, z, width, depth, true);
  overhangs.push(overhang);
}

function generateBox(x, y, z, width, depth, falls) {
 // ThreeJS
  const colors = [0xff0000, 0x00ff00, 0x0000ff]; // Array of three different colors (red, green, blue)
  shuffleArray(colors); // Shuffle the array to randomize the colors

  const color = new THREE.Color(colors[0]); // Get the first color from the shuffled array
  const material = new THREE.MeshLambertMaterial({ color }); // Use MeshLambertMaterial for better shading
  const geometry = new THREE.BoxGeometry(width, boxHeight, depth);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  scene.add(mesh);

  // CannonJS
  const shape = new CANNON.Box(
    new CANNON.Vec3(width / 2, boxHeight / 2, depth / 2)
  );
  let mass = falls ? 5 : 0; // If it shouldn't fall then setting the mass to zero will keep it stationary
  mass *= width / originalBoxSize; // Reduce mass proportionately by size
  mass *= depth / originalBoxSize; // Reduce mass proportionately by size
  const body = new CANNON.Body({ mass, shape });
  body.position.set(x, y, z);
  world.addBody(body);

  return {
    threejs: mesh,
    cannonjs: body,
    width,
    depth,
  };
}

// Function to shuffle an array
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function cutBox(topLayer, overlap, size, delta) {
  const direction = topLayer.direction;
  const newWidth = direction == "x" ? overlap : topLayer.width;
  const newDepth = direction == "z" ? overlap : topLayer.depth;

  // Update metadata
  topLayer.width = newWidth;
  topLayer.depth = newDepth;

  // Update ThreeJS model
  topLayer.threejs.scale[direction] = overlap / size;
  topLayer.threejs.position[direction] -= delta / 2;

  // Update CannonJS model
  topLayer.cannonjs.position[direction] -= delta / 2;

  // Replace shape with a smaller one (in CannonJS you can't simply just scale a shape)
  const shape = new CANNON.Box(
    new CANNON.Vec3(newWidth / 2, boxHeight / 2, newDepth / 2)
  );
  topLayer.cannonjs.shapes = [];
  topLayer.cannonjs.addShape(shape);
}

// Create a new Howl instance for the sound effect
const boxSound = new Howl({
  src: ['player.mp3'], // Replace with the path to your sound effect file
  volume: 1.0, // Adjust the volume as needed
});

// Create a new Howl instance for the game over sound effect
const gameOverSound = new Howl({
  src: ['gameover.mp3'], // Replace with the path to your game over sound effect file
  volume: 1.0, // Adjust the volume as needed
});

function eventHandler() {
  if (autopilot) {
    startGame();
  } else {
    if (isGameOver) {
      return; // If the game is over, do not proceed with the event
    }
    splitBlockAndAddNextOneIfOverlaps();
    // Play the box sound effect on a user gesture (mousedown, touchstart, or keydown)
    if (Howler.ctx.state === 'suspended') {
      Howler.ctx.resume().then(() => {
        boxSound.play();
      });
    } else {
      boxSound.play();
    }
  }
}


function splitBlockAndAddNextOneIfOverlaps() {
  if (gameEnded) return;

  const topLayer = stack[stack.length - 1];
  const previousLayer = stack[stack.length - 2];

  const direction = topLayer.direction;

  const size = direction == "x" ? topLayer.width : topLayer.depth;
  const delta =
    topLayer.threejs.position[direction] -
    previousLayer.threejs.position[direction];
  const overhangSize = Math.abs(delta);
  const overlap = size - overhangSize;

  if (overlap > 0) {
    cutBox(topLayer, overlap, size, delta);

    // Overhang
    const overhangShift = (overlap / 2 + overhangSize / 2) * Math.sign(delta);
    const overhangX =
      direction == "x"
        ? topLayer.threejs.position.x + overhangShift
        : topLayer.threejs.position.x;
    const overhangZ =
      direction == "z"
        ? topLayer.threejs.position.z + overhangShift
        : topLayer.threejs.position.z;
    const overhangWidth = direction == "x" ? overhangSize : topLayer.width;
    const overhangDepth = direction == "z" ? overhangSize : topLayer.depth;

    addOverhang(overhangX, overhangZ, overhangWidth, overhangDepth);

    // Next layer
    const nextX = direction == "x" ? topLayer.threejs.position.x : -10;
    const nextZ = direction == "z" ? topLayer.threejs.position.z : -10;
    const newWidth = topLayer.width; // New layer has the same size as the cut top layer
    const newDepth = topLayer.depth; // New layer has the same size as the cut top layer
    const nextDirection = direction == "x" ? "z" : "x";

    if (scoreElement) scoreElement.innerText = stack.length - 1;
    addLayer(nextX, nextZ, newWidth, newDepth, nextDirection);
  } else {
    missedTheSpot();
  }
}
function missedTheSpot() {
  if (isGameOverSoundPlayed) {
    return; // If the game over sound has been played, do not play it again
  }
  const topLayer = stack[stack.length - 1];
  // Turn to top layer into an overhang and let it fall down
  addOverhang(
    topLayer.threejs.position.x,
    topLayer.threejs.position.z,
    topLayer.width,
    topLayer.depth
  );
  world.remove(topLayer.cannonjs);
  scene.remove(topLayer.threejs);

  gameEnded = true;
  isGameOver = true; // Set the game over state to true

  if (resultsElement && !autopilot) resultsElement.style.display = "flex";
  // Update the highest score with the current score
  updateHighestScore(stack.length - 2);

  // Check if game over sound has already played
  if (!isGameOverSoundPlayed) {
    // Play the game over sound effect
    if (Howler.ctx.state === 'suspended') {
      Howler.ctx.resume().then(() => {
        gameOverSound.play();
      });
    } else {
      gameOverSound.play();
    }
  }
  isGameOverSoundPlayed = true; // Set the game over sound played flag to true
}


// Add the createBackground function
function createBackground() {
  const background = document.createElement("div");
  background.id = "background";
  document.body.appendChild(background);
}

function animation(time) {
  if (lastTime) {
    const timePassed = time - lastTime;
    const speed = 0.008;

    const topLayer = stack[stack.length - 1];
    const previousLayer = stack[stack.length - 2];

    // The top level box should move if the game has not ended AND
    // it's either NOT in autopilot or it is in autopilot and the box did not yet reach the robot position
    const boxShouldMove =
      !gameEnded &&
      (!autopilot ||
        (autopilot &&
          topLayer.threejs.position[topLayer.direction] <
            previousLayer.threejs.position[topLayer.direction] +
              robotPrecision));

    if (boxShouldMove) {
      // Keep the position visible on UI and the position in the model in sync
      topLayer.threejs.position[topLayer.direction] += speed * timePassed;
      topLayer.cannonjs.position[topLayer.direction] += speed * timePassed;

      // If the box went beyond the stack then show up the fail screen
      if (topLayer.threejs.position[topLayer.direction] > 10) {
        missedTheSpot();
      }
    } else {
      // If it shouldn't move then is it because the autopilot reached the correct position?
      // Because if so then next level is coming
      if (autopilot) {
        splitBlockAndAddNextOneIfOverlaps();
        setRobotPrecision();
      }
    }

    // 4 is the initial camera height
    if (camera.position.y < boxHeight * (stack.length - 2) + 4) {
      camera.position.y += speed * timePassed;
    }

    updatePhysics(timePassed);
    renderer.render(scene, camera);

    // Get the background element
    const background = document.getElementById("background");
    // Calculate the animation progress from 0 to 1
    const progress = (time / 2000) % 1;

    // Calculate the color based on the progress
    const r = Math.round(255 * progress);
    const g = Math.round(255 * (1 - progress));
    const b = Math.round(255 * Math.abs(progress - 0.5) * 2);

    // Set the background color
    background.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
  }
  lastTime = time;
}

// Add the createBackground function inside the init() function after appending the renderer.domElement
createBackground();

function updatePhysics(timePassed) {
  world.step(timePassed / 1000); // Step the physics world

  // Copy coordinates from Cannon.js to Three.js
  overhangs.forEach((element) => {
    element.threejs.position.copy(element.cannonjs.position);
    element.threejs.quaternion.copy(element.cannonjs.quaternion);
  });
}



window.addEventListener("resize", () => {
  // Adjust camera
  console.log("resize", window.innerWidth, window.innerHeight);
  const aspect = window.innerWidth / window.innerHeight;
  const width = 10;
  const height = width / aspect;

  camera.top = height / 2;
  camera.bottom = height / -2;

  // Reset renderer
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.render(scene, camera);
});



    
 