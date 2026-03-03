/**
 * Returns a Phaser texture key for a card's sprite.
 * For file-based sprites: uses preloaded 'sprite_*' keys.
 * For uploaded spriteData (base64): adds texture dynamically if needed.
 */
export function getCardTextureKey(scene, card) {
  if (!card) return null;
  if (card.sprite) {
    const key = 'sprite_' + card.sprite.replace('.png', '');
    return scene.textures.exists(key) ? key : null;
  }
  if (card.spriteData) {
    const key = 'sprite_custom_' + card.id;
    if (!scene.textures.exists(key)) {
      scene.textures.addBase64(key, card.spriteData);
    }
    return key;
  }
  return null;
}
