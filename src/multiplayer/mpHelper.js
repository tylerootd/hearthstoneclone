import Phaser from 'phaser';

const ST_IDLE = 0, ST_CHALLENGING = 1, ST_CHALLENGED = 2;
const SEND_RATE = 50;
const PLAYER_INTERACT_DIST = 60;
const FONT = { fontFamily: 'Arial, sans-serif' };

export function initMp(scene, opts = {}) {
  scene._mp = {
    remotePlayers: {},
    challengeState: ST_IDLE,
    challengePeer: null,
    challengeTimeout: null,
    lastSendTime: 0,
    lastSentX: 0,
    lastSentY: 0,
    lastSentAnim: '',
    returnScene: opts.returnScene || 'MmoMap',
    spriteScale: opts.spriteScale || 1.5,
    tagOffset: opts.tagOffset || -18,
  };
}

export function setupWs(scene) {
  if (!scene.ws || scene.ws.readyState !== WebSocket.OPEN) return;
  scene.ws.onmessage = (event) => handleMsg(scene, JSON.parse(event.data));
  scene.ws.onclose = () => { if (scene.playerCountText) scene.playerCountText.setText('Disconnected'); };
}

export function joinRoom(scene, room, x, y) {
  if (scene.ws && scene.ws.readyState === WebSocket.OPEN) {
    scene.ws.send(JSON.stringify({ type: 'join_room', room, x: Math.round(x), y: Math.round(y) }));
  }
}

function handleMsg(scene, msg) {
  const mp = scene._mp;
  switch (msg.type) {
    case 'welcome':
      scene.myId = msg.id;
      for (const [pid, p] of Object.entries(msg.players)) {
        if (pid !== scene.myId) addRemote(scene, pid, p.x, p.y, p.anim);
      }
      syncCount(scene);
      break;
    case 'join':
      addRemote(scene, msg.id, msg.x, msg.y, msg.anim);
      syncCount(scene);
      break;
    case 'move': {
      const r = mp.remotePlayers[msg.id];
      if (r) { r.targetX = msg.x; r.targetY = msg.y; r.anim = msg.anim || 'idle_down'; }
      break;
    }
    case 'leave':
      if (mp.challengePeer === msg.id) {
        mp.challengeState = ST_IDLE; mp.challengePeer = null;
        showStatus(scene, 'Opponent disconnected', 2000);
      }
      removeRemote(scene, msg.id);
      syncCount(scene);
      break;
    case 'challenged':
      if (mp.challengeState === ST_IDLE) { mp.challengeState = ST_CHALLENGED; mp.challengePeer = msg.fromId; }
      break;
    case 'declined':
      if (mp.challengeState === ST_CHALLENGING && mp.challengePeer === msg.byId) {
        mp.challengeState = ST_IDLE; mp.challengePeer = null;
        showStatus(scene, 'Duel declined', 2000);
      }
      break;
    case 'pvp_start':
      launchPvp(scene);
      break;
  }
  if (scene.onServerMessage) scene.onServerMessage(msg);
}

function addRemote(scene, id, x, y, anim) {
  const mp = scene._mp;
  if (mp.remotePlayers[id]) return;
  const sprite = scene.add.sprite(x, y, 'ninja_npc_green', 0).setDepth(6).setScale(mp.spriteScale);
  const tag = scene.add.text(x, y + mp.tagOffset, `Player ${id}`, {
    ...FONT, fontSize: '7px', color: '#aaffaa', stroke: '#000', strokeThickness: 2
  }).setOrigin(0.5).setDepth(11);
  mp.remotePlayers[id] = { sprite, tag, targetX: x, targetY: y, anim: anim || 'idle_down' };
}

function removeRemote(scene, id) {
  const r = scene._mp.remotePlayers[id];
  if (r) { r.sprite.destroy(); r.tag.destroy(); delete scene._mp.remotePlayers[id]; }
}

function syncCount(scene) {
  const count = Object.keys(scene._mp.remotePlayers).length + 1;
  if (scene.playerCountText) scene.playerCountText.setText(`Players: ${count}`);
}

export function showStatus(scene, msg, duration) {
  if (scene.statusText) scene.statusText.setText(msg);
  if (duration) scene.time.delayedCall(duration, () => { if (scene.statusText) scene.statusText.setText(''); });
}

export function sendPos(scene, time, x, y, animKey) {
  const mp = scene._mp;
  if (!scene.ws || scene.ws.readyState !== WebSocket.OPEN || time - mp.lastSendTime <= SEND_RATE) return;
  const px = Math.round(x), py = Math.round(y);
  if (px !== mp.lastSentX || py !== mp.lastSentY || animKey !== mp.lastSentAnim) {
    scene.ws.send(JSON.stringify({ type: 'move', x: px, y: py, anim: animKey }));
    mp.lastSentX = px; mp.lastSentY = py; mp.lastSentAnim = animKey;
  }
  mp.lastSendTime = time;
}

export function interpRemote(scene) {
  const mp = scene._mp;
  for (const id of Object.keys(mp.remotePlayers)) {
    const r = mp.remotePlayers[id];
    r.sprite.x = Phaser.Math.Linear(r.sprite.x, r.targetX, 0.25);
    r.sprite.y = Phaser.Math.Linear(r.sprite.y, r.targetY, 0.25);
    r.tag.x = r.sprite.x;
    r.tag.y = r.sprite.y + mp.tagOffset;
    const ra = 'remote_' + (r.anim || 'idle_down');
    if (scene.anims.exists(ra)) r.sprite.play(ra, true);
  }
}

export function findNearest(scene, px, py, dist) {
  const mp = scene._mp;
  let closest = null, best = dist || PLAYER_INTERACT_DIST;
  for (const [id, r] of Object.entries(mp.remotePlayers)) {
    const d = Phaser.Math.Distance.Between(px, py, r.sprite.x, r.sprite.y);
    if (d < best) { best = d; closest = id; }
  }
  return closest;
}

/**
 * Drive the challenge state machine each frame.
 * Returns a string indicating current state, or null if idle with nobody near.
 * The calling scene can use the return value to decide what else to show in the prompt.
 */
export function tickChallenge(scene, ePressed, qPressed) {
  const mp = scene._mp;

  if (mp.challengeState === ST_IDLE) {
    const nearId = findNearest(scene, scene.player.x, scene.player.y);
    if (nearId) {
      if (scene.promptText) scene.promptText.setText(`[E] Duel Player ${nearId}`);
      if (ePressed && scene.ws?.readyState === WebSocket.OPEN) {
        mp.challengeState = ST_CHALLENGING;
        mp.challengePeer = nearId;
        scene.ws.send(JSON.stringify({ type: 'challenge', targetId: nearId }));
        showStatus(scene, 'Duel request sent! Waiting...', 0);
      }
      return 'near_player';
    }
    return null;
  }

  if (mp.challengeState === ST_CHALLENGING) {
    if (scene.promptText) scene.promptText.setText(`Waiting for Player ${mp.challengePeer}...`);
    if (!mp.challengeTimeout) {
      mp.challengeTimeout = scene.time.delayedCall(15000, () => {
        if (mp.challengeState === ST_CHALLENGING) { mp.challengeState = ST_IDLE; mp.challengePeer = null; showStatus(scene, 'Duel request timed out', 2000); }
        mp.challengeTimeout = null;
      });
    }
    return 'challenging';
  }

  if (mp.challengeState === ST_CHALLENGED) {
    if (scene.promptText) scene.promptText.setText(`Player ${mp.challengePeer} wants to duel! [E] Accept  [Q] Decline`);
    if (ePressed && scene.ws?.readyState === WebSocket.OPEN) {
      scene.ws.send(JSON.stringify({ type: 'accept', fromId: mp.challengePeer }));
      showStatus(scene, 'Accepted! Starting duel...', 0);
    }
    if (qPressed && scene.ws?.readyState === WebSocket.OPEN) {
      scene.ws.send(JSON.stringify({ type: 'decline', fromId: mp.challengePeer }));
      mp.challengeState = ST_IDLE; mp.challengePeer = null;
      showStatus(scene, 'Duel declined', 2000);
      if (mp.challengeTimeout) { mp.challengeTimeout.destroy(); mp.challengeTimeout = null; }
    }
    return 'challenged';
  }

  return null;
}

function launchPvp(scene) {
  if (scene.destroyButtons) scene.destroyButtons();
  scene._keepWs = true;
  scene.scene.start('PvpBattle', {
    ws: scene.ws, myId: scene.myId,
    playerX: scene.player.x, playerY: scene.player.y,
    returnTo: scene._mp.returnScene,
    returnData: scene._pvpReturnData ? scene._pvpReturnData() : {}
  });
}

export function cleanupMp(scene) {
  const mp = scene._mp;
  if (!mp) return;
  if (mp.challengeTimeout) { mp.challengeTimeout.destroy(); mp.challengeTimeout = null; }
  for (const id of Object.keys(mp.remotePlayers)) removeRemote(scene, id);
}
