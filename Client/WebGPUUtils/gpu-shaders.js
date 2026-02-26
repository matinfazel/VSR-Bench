/**
 * @license
 * Copyright 2022 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */

const VERTEX_SHADER = `
struct VertexOutput {
  @builtin(position) Position : vec4<f32>,
  @location(0) fragUV : vec2<f32>,
}
@vertex
fn main(@builtin(vertex_index) VertexIndex : u32) -> VertexOutput {
  var pos = array<vec2<f32>, 6>(
    vec2<f32>( 1.0,  1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0,  1.0),
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(-1.0,  1.0)
  );
  var uv = array<vec2<f32>, 6>(
    vec2<f32>(1.0, 0.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(0.0, 0.0)
  );
  var output : VertexOutput;
  output.Position = vec4<f32>(pos[VertexIndex], 0.0, 1.0);
  output.fragUV = uv[VertexIndex];
  return output;
}
`;

const PIXEL_SHADER = `
struct SizeParams {
  width : i32,
  height : i32,
}
@group(0) @binding(1) var<storage, read_write> buf : array<vec4<f32>>;
@group(0) @binding(2) var<uniform> size : SizeParams;
@fragment
fn main(@location(0) fragUV : vec2<f32>) -> @location(0) vec4<f32> {
  let coord = vec2(fragUV.x, fragUV.y);
  let rowCol = vec2<i32>(i32(coord.y * f32(size.height)), i32(coord.x * f32(size.width)));
  let color = (buf[rowCol.x * size.width + rowCol.y]).rgb; // Not sure if this is right
  var out_color : vec4<f32>; 
  out_color = vec4<f32>(color, 1.0);
  return out_color;
}`