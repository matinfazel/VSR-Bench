const PASSTHROUGH_VERTEX_SHADER = `#version 300 es
in vec4 position;
in vec4 input_tex_coord;

out vec2 tex_coord;

void main() {
  gl_Position = position;
  tex_coord = input_tex_coord.xy;
}`;

const MASK_SHADER = `#version 300 es

precision mediump float;

uniform sampler2D sharp;

in highp vec2 tex_coord;
out vec4 out_color;

void main() {
  // The user-facing camera is mirrored, flip horizontally.
  //vec2 coord = vec2(1.0 - tex_coord[0], tex_coord[1]);
  vec4 src_color = texture(sharp, tex_coord).rgba;
  out_color = vec4(src_color.rgb, 1.0);
  
}`
