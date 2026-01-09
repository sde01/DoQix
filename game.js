const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const percentEl = document.getElementById('percent');
const levelEl = document.getElementById('level');
const scoreEl = document.getElementById('scoreVal');

const ROWS = 80;
const COLS = 120;
const CELL_SIZE = 5;

// --- GESTION DES IMAGES ---
const bgImageSharp = new Image();
let imageLoaded = false;
bgImageSharp.onload = () => { imageLoaded = true; };

function setLevelImage(lvl) {
    imageLoaded = false;
    const url = `https://picsum.photos/800/600?random=${lvl}`;
    const bgDiv = document.getElementById('game-bg-blurred');
    if (bgDiv) bgDiv.style.backgroundImage = `url('${url}')`;
    bgImageSharp.src = url;
}

// --- VARIABLES DE JEU ---
let grid = [];
let gameStarted = false;
let playerCount = 1;
let players = [];
let enemies = [];
let sparxes = [];
let level = 1;
let isGameOver = false;
let score = 0;
let isLevelComplete = false;

// --- LOGIQUE DE DÉMARRAGE ---
function startGame(mode) {
    playerCount = mode;
    gameStarted = true;
    document.getElementById('menu-overlay').style.display = 'none';

    players = [];
    players.push({ x: 0, y: ROWS - 1, dx: 0, dy: 0, isDrawing: false, color: 'yellow', id: 1 });
    if (playerCount === 2) {
        players.push({ x: COLS - 1, y: ROWS - 1, dx: 0, dy: 0, isDrawing: false, color: 'cyan', id: 2 });
    }
    initLevel(1);
}

function initLevel(lvl) {
    level = lvl;
    levelEl.innerText = level;
    percentEl.innerText = 0;
    isGameOver = false;
    isLevelComplete = false;

    setLevelImage(level);

    if (level === 1) {
        score = 0;
        scoreEl.innerText = "0";
    }

    // 1. Reset Grille
    grid = Array(ROWS).fill().map(() => Array(COLS).fill(0));
    for (let r = 0; r < ROWS; r++) { grid[r][0] = 1; grid[r][COLS - 1] = 1; }
    for (let c = 0; c < COLS; c++) { grid[0][c] = 1; grid[ROWS - 1][c] = 1; }

    // 2. Reset Joueurs
    players[0].x = 0; players[0].y = ROWS - 1;
    if (playerCount === 2) {
        players[1].x = COLS - 1; players[1].y = ROWS - 1;
    }
    players.forEach(p => { p.dx = 0; p.dy = 0; p.isDrawing = false; });

    // 4. Création Qix (CORRIGÉ)
    let qixCount = 1 + Math.floor((level - 1) / 2);
    enemies = [];
    for (let i = 0; i < qixCount; i++) {
        enemies.push({
            x: COLS / 2, y: ROWS / 2,
            vx: 0, vy: 0,
            // Ces variables sont OBLIGATOIRES pour le nouveau mouvement :
            targetX: Math.random() * COLS,
            targetY: Math.random() * ROWS,
            changeTimer: 0,
            history: [], maxHistory: 20, angle: 0
        });
    }

    // 4. Création Sparxes
    let sparxCount = 1 + Math.floor(level / 2);
    sparxes = [];
    for (let i = 0; i < sparxCount; i++) {
        sparxes.push({
            x: Math.floor(COLS / 2), y: 0,
            speed: 0.2,
            lastX: -1, lastY: -1,
            spawnTimer: 60 // Protection 1 seconde
        });
    }
}

// --- LOGIQUE DE MISE À JOUR ---
function update() {
    if (!gameStarted || isGameOver || isLevelComplete) return;

    // 1. Mouvement Joueurs
    players.forEach(p => {
        let nextX = p.x + p.dx;
        let nextY = p.y + p.dy;

        if (nextX >= 0 && nextX < COLS && nextY >= 0 && nextY < ROWS) {
            let target = grid[nextY][nextX];

            if (target === 0) {
                // Zone vide : on dessine
                p.isDrawing = true;
                grid[nextY][nextX] = 2;
                p.x = nextX; p.y = nextY;

            } else if (target === 1) {
                // Zone conquise (Mur)
                if (p.isDrawing) {
                    // On vient de fermer une boucle
                    finalizeConquest();
                    // Note : rescueTrappedPlayers() est appelé DANS finalizeConquest
                } else if (isEdge(nextX, nextY)) {
                    // Déplacement normal sur les lignes
                    p.x = nextX; p.y = nextY;
                } else {
                    // On bute contre un mur intérieur (zone remplie), on s'arrête
                    p.dx = 0; p.dy = 0;
                }

            } else if (target === 2) {
                // COOPÉRATION : On touche un trait (le sien ou celui de l'autre)
                if (p.isDrawing) {
                    // On ferme la boucle en rejoignant un trait existant
                    finalizeConquest();
                } else {
                    // On entre sur un trait existant sans dessiner
                    p.x = nextX; p.y = nextY;
                    p.isDrawing = true;
                }
            }
        }
    });


    // 2. Mouvement Qix
    enemies.forEach(qix => {
        qix.changeTimer--;
        if (qix.changeTimer <= 0) {
            // Cible aléatoire inchangée
            qix.targetX = Math.random() * (COLS - 2) + 1;
            qix.targetY = Math.random() * (ROWS - 2) + 1;

            // MODIF 1 : Délai plus long (60 à 180 frames = 1s à 3s)
            // Avant c'était 30-90. Le Qix sera moins "nerveux".
            qix.changeTimer = 60 + Math.random() * 120;
        }

        // B. Accélération vers la cible (Steering force)
        // Cela donne des courbes fluides au lieu de lignes droites robotiques
        let dx = qix.targetX - qix.x;
        let dy = qix.targetY - qix.y;
        let angleToTarget = Math.atan2(dy, dx);

        // On ajoute une force de poussée vers la cible
        let force = 0.05; // Puissance du virage
        qix.vx += Math.cos(angleToTarget) * force;
        qix.vy += Math.sin(angleToTarget) * force;

        // C. Limitation de la vitesse (Pour ne pas qu'il parte à la vitesse de la lumière)
        // On augmente un peu la vitesse max pour rendre le jeu plus nerveux
        const maxSpeed = 0.6 + (level * 0.05);
        let currentSpeed = Math.hypot(qix.vx, qix.vy);
        if (currentSpeed > maxSpeed) {
            qix.vx = (qix.vx / currentSpeed) * maxSpeed;
            qix.vy = (qix.vy / currentSpeed) * maxSpeed;
        }

        // D. Application du mouvement
        let nextX = qix.x + qix.vx;
        let nextY = qix.y + qix.vy;

        // E. Gestion des rebonds sur les murs (Bords ou Zones Conquises)
        // Vérification X
        let cx = Math.floor(nextX), cy = Math.floor(qix.y);
        if (cx <= 0 || cx >= COLS - 1 || (grid[cy] && grid[cy][cx] === 1)) {
            qix.vx *= -1; // Rebond simple
            qix.changeTimer = 0; // Force le changement de cible immédiat si on touche un mur
        } else {
            qix.x = nextX;
        }

        // Vérification Y
        let cny = Math.floor(nextY), cnx = Math.floor(qix.x);
        if (cny <= 0 || cny >= ROWS - 1 || (grid[cny] && grid[cny][cnx] === 1)) {
            qix.vy *= -1; // Rebond simple
            qix.changeTimer = 0; // Force changement de cible
        } else {
            qix.y = nextY;
        }

        // F. Collisions (Game Over)
        // 1. Collision avec le TRAIT en cours (Mortelle pour le joueur)
        let fx = Math.floor(qix.x), fy = Math.floor(qix.y);
        if (grid[fy] && grid[fy][fx] === 2) {
            gameOver("Un Qix a brisé votre ligne !");
        }

        // 2. Collision directe avec les JOUEURS
        players.forEach(p => {
            // On augmente la distance de collision car le Qix est visuellement plus gros (rayon ~12px)
            // 1 unité grille = 5px. Donc une distance de 3.0 = 15px.
            if (Math.hypot(p.x - qix.x, p.y - qix.y) < 3.0) {
                gameOver(`Le Qix a désintégré le joueur ${p.id} !`);
            }
        });


        // G. Effet visuel (Traînée)
        qix.history.push({ x: qix.x, y: qix.y, angle: Math.atan2(qix.vy, qix.vx) });
        if (qix.history.length > qix.maxHistory) qix.history.shift();
    });

    // 3. Mouvement Sparx
    sparxes.forEach(sparx => {
        if (sparx.spawnTimer > 0) sparx.spawnTimer--;

        let ix = Math.round(sparx.x), iy = Math.round(sparx.y);
        if (!isEdge(ix, iy)) {
            let n = findNearestEdge(sparx.x, sparx.y);
            sparx.x = n.x; sparx.y = n.y;
        } else {
            let dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]].sort(() => Math.random() - 0.5);
            for (let [dx, dy] of dirs) {
                if (isEdge(ix + dx, iy + dy) && (ix + dx !== sparx.lastX || iy + dy !== sparx.lastY)) {
                    sparx.lastX = ix; sparx.lastY = iy;
                    sparx.x += dx; sparx.y += dy;
                    break;
                }
            }
        }

        if (sparx.spawnTimer === 0) {
            players.forEach(p => {
                // Le Sparx fait aussi environ 14px de large.
                if (Math.hypot(p.x - sparx.x, p.y - sparx.y) < 2.5) {
                    gameOver("Touché par un Sparx !");
                }
            })
        }
    });
}

function finalizeConquest() {

    // 1. D'abord, on sécurise : on arrête le dessin pour TOUT LE MONDE immédiatement.
    // Cela empêche la boucle infinie si la fonction échoue plus bas.
    players.forEach(pl => pl.isDrawing = false);

    let newlyConqueredCount = 0;

    // 1. Convertir le trait rouge (2) en mur (1)
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (grid[r][c] === 2) {
                grid[r][c] = 1;
                newlyConqueredCount++;
            }
        }
    }

    // 2. Flood Fill pour trouver la zone sûre
    let safeArea = Array(ROWS).fill().map(() => Array(COLS).fill(false));
    let stack = [];

    // --- CORRECTION MAJEURE ICI ---
    enemies.forEach(e => {
        let ex = Math.floor(e.x);
        let ey = Math.floor(e.y);

        // Si le Qix est bien sur du vide, on ajoute sa position
        if (ex >= 0 && ex < COLS && ey >= 0 && ey < ROWS && grid[ey][ex] === 0) {
            stack.push([ey, ex]);
        } else {
            // SI LE QIX TOUCHE UN MUR : On cherche un voisin vide pour démarrer le flood fill
            // On regarde les 8 cases autour pour être sûr de trouver du vide
            let neighbors = [
                [0, 1], [0, -1], [1, 0], [-1, 0],
                [1, 1], [-1, -1], [1, -1], [-1, 1]
            ];

            for (let [dy, dx] of neighbors) {
                let ny = ey + dy;
                let nx = ex + dx;
                if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS && grid[ny][nx] === 0) {
                    stack.push([ny, nx]);
                    break; // On a trouvé un point de départ valide, on arrête de chercher
                }
            }
        }
    });
    // -----------------------------

    // Si malgré la correction, la stack est vide (cas très rare où le Qix est emmuré vivant)
    // On évite le bug de victoire instantanée en ne faisant rien.
    if (stack.length === 0) {
        console.warn("Le Qix est coincé dans un mur, remplissage annulé pour éviter le bug.");
        return;
    }

    while (stack.length > 0) {
        let [r, c] = stack.pop();
        if (r >= 0 && r < ROWS && c >= 0 && c < COLS && grid[r][c] === 0 && !safeArea[r][c]) {
            safeArea[r][c] = true;
            stack.push([r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]);
        }
    }

    // 3. Remplissage et comptage final
    let totalConquered = 0;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (!safeArea[r][c] && grid[r][c] === 0) {
                grid[r][c] = 1;
                newlyConqueredCount++;
            }
            if (grid[r][c] === 1) totalConquered++;
        }
    }

    // --- SAUVETAGE JOUEURS (Ajouté précédemment) ---
    rescueTrappedPlayers();
    players.forEach(pl => pl.isDrawing = false);

    // --- CALCUL SCORE ---
    let points = newlyConqueredCount * newlyConqueredCount;
    score += points;
    scoreEl.innerText = score.toLocaleString();

    let p = Math.floor((totalConquered / (ROWS * COLS)) * 100);
    percentEl.innerText = p;

    if (p >= 75 && !isLevelComplete) {
        isLevelComplete = true;
        setTimeout(() => {
            alert(`Niveau ${level} terminé !\nScore: ${score}`);
            initLevel(level + 1);
        }, 1000);
    }
}

// --- UTILITAIRES ---
function isEdge(x, y) {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS || grid[y][x] !== 1) return false;
    const neighbors = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    return neighbors.some(([dx, dy]) => {
        let nx = x + dx, ny = y + dy;
        return (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || grid[ny][nx] === 0);
    });
}

function findNearestEdge(x, y) {
    let minDest = Infinity; let found = { x: 0, y: 0 };
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (isEdge(c, r)) {
                let d = Math.hypot(c - x, r - y);
                if (d < minDest) { minDest = d; found = { x: c, y: r }; }
            }
        }
    }
    return found;
}

function gameOver(msg) {
    isGameOver = true;
    setTimeout(() => {
        alert(msg);
        gameStarted = false;
        document.getElementById('menu-overlay').style.display = 'flex';
    }, 10);
}

function rescueTrappedPlayers() {
    players.forEach(p => {
        // On arrondit la position pour être sûr de tester la bonne case
        let ix = Math.round(p.x);
        let iy = Math.round(p.y);

        // Si le joueur n'est plus sur une arrête valide (il est dans le "gris")
        if (!isEdge(ix, iy)) {
            // On cherche l'arrête valide la plus proche (comme pour le Sparx)
            let safeSpot = findNearestEdge(p.x, p.y);

            // On téléporte le joueur
            p.x = safeSpot.x;
            p.y = safeSpot.y;

            // On arrête son mouvement pour éviter qu'il ne retourne dans le mur
            p.dx = 0;
            p.dy = 0;
            p.isDrawing = false;
        }
    });
}

// --- DESSIN ---
function draw() {
    if (!gameStarted) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (isLevelComplete && imageLoaded) {
        ctx.drawImage(bgImageSharp, 0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "white"; ctx.font = "40px Courier";
        ctx.fillText("NIVEAU TERMINÉ !", 150, 200);
        return;
    }

    if (imageLoaded) {
        let srcW = bgImageSharp.width / COLS;
        let srcH = bgImageSharp.height / ROWS;
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (grid[r][c] === 1) {
                    ctx.drawImage(bgImageSharp, c * srcW, r * srcH, srcW, srcH, c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                } else if (grid[r][c] === 2) {
                    ctx.fillStyle = 'red'; ctx.fillRect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                }
            }
        }
    }

    // --- DESSIN DES JOUEURS (Carrés avec bordure blanche) ---
    players.forEach(p => {
        let size = 12; // Taille fixe plus grosse que la grille (5px)
        let drawX = p.x * CELL_SIZE - (size / 2) + (CELL_SIZE / 2);
        let drawY = p.y * CELL_SIZE - (size / 2) + (CELL_SIZE / 2);

        ctx.shadowBlur = 10; ctx.shadowColor = "black"; // Ombre pour le contraste

        ctx.fillStyle = p.color;
        ctx.fillRect(drawX, drawY, size, size);

        // Contour blanc pour détacher du fond
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.strokeRect(drawX, drawY, size, size);

        ctx.shadowBlur = 0; // Reset
    });

    // --- DESSIN DU QIX (Grandes bulles néon) ---
    enemies.forEach(qix => {
        ctx.shadowBlur = 15; ctx.shadowColor = "cyan";

        // Traînée (History)
        qix.history.forEach((pos, i) => {
            ctx.globalAlpha = (i / qix.history.length) * 0.5; // Dégradé
            ctx.fillStyle = "cyan";
            ctx.beginPath();
            // Traînée plus large
            ctx.arc(pos.x * CELL_SIZE, pos.y * CELL_SIZE, 6, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1.0;

        // Tête du Qix (Gros cercle avec contour)
        ctx.beginPath();
        let r = 10 + Math.sin(Date.now() / 200) * 2; // Pulsation (10px à 12px de rayon)
        ctx.arc(qix.x * CELL_SIZE, qix.y * CELL_SIZE, r, 0, Math.PI * 2);

        ctx.fillStyle = "rgba(0, 255, 255, 0.6)"; // Intérieur semi-transparent
        ctx.fill();

        ctx.strokeStyle = "white"; // Contour blanc solide
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.shadowBlur = 0;
    });

    // --- DESSIN DES SPARX (Losanges rotatifs rouges) ---
    sparxes.forEach(sparx => {
        let size = 14;
        let drawX = sparx.x * CELL_SIZE + (CELL_SIZE / 2);
        let drawY = sparx.y * CELL_SIZE + (CELL_SIZE / 2);

        ctx.save();
        ctx.translate(drawX, drawY);
        ctx.rotate(Date.now() * 0.005); // Rotation continue

        ctx.shadowBlur = 10; ctx.shadowColor = "red";

        ctx.fillStyle = sparx.spawnTimer > 0 ? "rgba(255, 100, 100, 0.5)" : "#ff0000";
        ctx.beginPath();
        ctx.moveTo(0, -size / 2);
        ctx.lineTo(size / 2, 0);
        ctx.lineTo(0, size / 2);
        ctx.lineTo(-size / 2, 0);
        ctx.closePath();
        ctx.fill();

        // Contour blanc
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.restore();
        ctx.shadowBlur = 0;
    });
}

// --- BOUCLE ---
window.addEventListener('keydown', e => {
    if (!gameStarted) return;
    if (e.key === 'ArrowUp') { players[0].dx = 0; players[0].dy = -1; }
    if (e.key === 'ArrowDown') { players[0].dx = 0; players[0].dy = 1; }
    if (e.key === 'ArrowLeft') { players[0].dx = -1; players[0].dy = 0; }
    if (e.key === 'ArrowRight') { players[0].dx = 1; players[0].dy = 0; }

    if (playerCount === 2) {
        const key = e.key.toLowerCase();
        if (key === 'z') { players[1].dx = 0; players[1].dy = -1; }
        if (key === 's') { players[1].dx = 0; players[1].dy = 1; }
        if (key === 'q') { players[1].dx = -1; players[1].dy = 0; }
        if (key === 'd') { players[1].dx = 1; players[1].dy = 0; }
    }
});

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}
loop();