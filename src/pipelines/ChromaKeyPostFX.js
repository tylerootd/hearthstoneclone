import Phaser from 'phaser';

const fragShader = `
precision mediump float;

uniform sampler2D uMainSampler;
varying vec2 outTexCoord;

void main() {
  vec4 color = texture2D(uMainSampler, outTexCoord);
  float blueDom = color.b - max(color.r, color.g);
  float alpha = 1.0 - smoothstep(0.08, 0.35, blueDom);
  gl_FragColor = vec4(color.rgb * alpha, color.a * alpha);
}
`;

export default class ChromaKeyPostFX extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game) {
    super({ game, name: 'ChromaKeyPostFX', fragShader });
  }
}
