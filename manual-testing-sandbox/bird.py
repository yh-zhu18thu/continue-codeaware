# Boids群鸟模拟 - 基于Arcade
# 实现分离、对齐、凝聚三大规则和障碍物避障
# 完全遵循描述及各实现步骤

# ---- 步骤s-1: 导入依赖 ----
import arcade
import random
import math
from collections import namedtuple

# ---- 工具向量相关 ----
def vec_add(a, b):
    return [a[0] + b[0], a[1] + b[1]]
def vec_sub(a, b):
    return [a[0] - b[0], a[1] - b[1]]
def vec_scale(v, s):
    return [v[0]*s, v[1]*s]
def vec_length(v):
    return math.hypot(v[0], v[1])
def vec_normalize(v):
    length = vec_length(v)
    if length == 0:
        return [0, 0]
    return [v[0]/length, v[1]/length]
def vec_limit(v, max_length):
    length = vec_length(v)
    if length > max_length:
        return vec_scale(vec_normalize(v), max_length)
    return v[:]
def vec_dot(a, b):
    return a[0]*b[0] + a[1]*b[1]
def vec_angle_between(a, b):
    dot = vec_dot(a, b)
    len_prod = vec_length(a) * vec_length(b)
    if len_prod == 0:
        return 0
    return math.acos(max(-1.0, min(1.0, dot / len_prod)))
def vec_perpendicular(v):
    return [-v[1], v[0]] # 逆时针旋转90度

def vec_signed_perp_dir(from_vec, to_point):
    # 返回from_vec到to_point的方向(左为正，右为负)
    return (from_vec[0]*to_point[1] - from_vec[1]*to_point[0])

# ---- 步骤s-3: 定义Boid类及属性 ----
class Boid:
    def __init__(self, x, y):
        self.position = [x, y]             # 位置
        angle = random.uniform(0, 2*math.pi)
        speed = random.uniform(2, 4)
        self.velocity = [math.cos(angle) * speed, math.sin(angle) * speed]  # 速度
        self.acceleration = [0, 0]
        self.max_speed = 5.0
        self.max_force = 0.12
        self.size = 7.0 # 用于绘制
        # 视觉参数
        self.perception_radius = 50
        self.separation_radius = 20
        # 避障相关
        self.avoid_obstacle_force = 1.0
        self.avoid_obstacle_radius = 50
        self.avoid_angle = math.pi # 半圆, 180°
        self.color_normal = arcade.color.YELLOW
        self.color_avoid = arcade.color.RED # 避障高亮色

    # ---- 步骤s-4: Boid运动与边界处理 ----
    def update(self, width, height):
        self.velocity = vec_add(self.velocity, self.acceleration)
        self.velocity = vec_limit(self.velocity, self.max_speed)
        self.position = vec_add(self.position, self.velocity)
        self.acceleration = [0, 0]
        # 边界环绕
        if self.position[0] < 0:
            self.position[0] += width
        elif self.position[0] > width:
            self.position[0] -= width
        if self.position[1] < 0:
            self.position[1] += height
        elif self.position[1] > height:
            self.position[1] -= height

    # ---- 步骤s-12: 前方半圆障碍感知检测 ----
    def detect_obstacles(self, obstacles):
        sensing_results = []
        v_dir = vec_normalize(self.velocity)
        for obs in obstacles:
            to_obs = vec_sub(obs.position, self.position)
            d = vec_length(to_obs)
            if d < self.avoid_obstacle_radius + obs.radius: # 感知距离
                if d == 0:
                    continue
                angle = vec_angle_between(v_dir, to_obs)
                if angle < self.avoid_angle / 2: # 半圆范围内
                    sensing_results.append((obs, d, to_obs))
        return sensing_results

    # ---- 步骤s-13: 距离计算避障力与确定方向 ----
    def compute_avoid_force(self, obstacles):
        forces = []
        sensing = self.detect_obstacles(obstacles)
        for obs, d, to_obs in sensing:
            # 距离越近，力越大 (线性衰减)
            force_mag = self.avoid_obstacle_force * (1.0 - min(1, d/(self.avoid_obstacle_radius+obs.radius)))
            # 垂直于速度方向,远离障碍物一侧
            v_dir = vec_normalize(self.velocity)
            perp = vec_perpendicular(v_dir)
            # 判断障碍在左/右侧
            cross_v_to_obs = (v_dir[0]*to_obs[1] - v_dir[1]*to_obs[0])
            if cross_v_to_obs > 0:
                avoid_dir = perp # 障碍物在左侧 -> 则往右躲
            else:
                avoid_dir = vec_scale(perp, -1) # 障碍物在右侧 -> 往左躲
            avoid_force = vec_scale(vec_normalize(avoid_dir), force_mag)
            forces.append(avoid_force)
        if forces:
            # 多障碍合成力
            total_force = [0, 0]
            for f in forces:
                total_force = vec_add(total_force, f)
            # 限制最大避障力
            return vec_limit(total_force, self.max_force * 2)
        return [0, 0]

    # ---- 步骤s-7: 分离规则 ----
    def separation(self, boids):
        steer = [0, 0]
        total = 0
        for other in boids:
            if other is self:
                continue
            d = vec_length(vec_sub(self.position, other.position))
            if 0 < d < self.separation_radius:
                diff = vec_sub(self.position, other.position)
                diff = vec_normalize(diff)
                diff = vec_scale(diff, 1/d)
                steer = vec_add(steer, diff)
                total += 1
        if total > 0:
            steer = vec_scale(steer, 1/total)
            steer = vec_limit(steer, self.max_force)
        return steer

    # ---- 步骤s-8: 对齐规则 ----
    def alignment(self, boids):
        avg_vel = [0, 0]
        total = 0
        for other in boids:
            if other is self:
                continue
            d = vec_length(vec_sub(self.position, other.position))
            if d < self.perception_radius:
                avg_vel = vec_add(avg_vel, other.velocity)
                total += 1
        if total > 0:
            avg_vel = vec_scale(avg_vel, 1/total)
            avg_vel = vec_normalize(avg_vel)
            avg_vel = vec_scale(avg_vel, self.max_speed)
            steer = vec_sub(avg_vel, self.velocity)
            steer = vec_limit(steer, self.max_force)
            return steer
        return [0, 0]

    # ---- 步骤s-9: 凝聚规则 ----
    def cohesion(self, boids):
        center = [0, 0]
        total = 0
        for other in boids:
            if other is self:
                continue
            d = vec_length(vec_sub(self.position, other.position))
            if d < self.perception_radius:
                center = vec_add(center, other.position)
                total += 1
        if total > 0:
            center = vec_scale(center, 1/total)
            desired = vec_sub(center, self.position)
            desired = vec_normalize(desired)
            desired = vec_scale(desired, self.max_speed)
            steer = vec_sub(desired, self.velocity)
            steer = vec_limit(steer, self.max_force)
            return steer
        return [0, 0]

    # ---- 步骤s-10/s-14: 规则组合, 包含避障 ----
    def apply_behavior(self, boids, obstacles, weights):
        # 计算三大规则 + 避障
        sep = self.separation(boids)
        ali = self.alignment(boids)
        coh = self.cohesion(boids)
        avoid = self.compute_avoid_force(obstacles)
        # 权重整合,避障优先级高
        self.acceleration = [0, 0]
        self.acceleration = vec_add(self.acceleration, vec_scale(sep, weights['separation']))
        self.acceleration = vec_add(self.acceleration, vec_scale(ali, weights['alignment']))
        self.acceleration = vec_add(self.acceleration, vec_scale(coh, weights['cohesion']))
        self.acceleration = vec_add(self.acceleration, vec_scale(avoid, weights['avoid']))
        # 记录是否受避障力（用于高亮）
        self.avoiding = vec_length(avoid) > 0.01

    # ---- 步骤s-15: 绘制Boid及方向 ----
    def draw(self):
        # 箭头三角,旋转朝向速度
        pos = self.position
        angle = math.atan2(self.velocity[1], self.velocity[0])
        # Triangle points (head, left, right)
        head = (pos[0] + math.cos(angle) * self.size,
                pos[1] + math.sin(angle) * self.size)
        left = (pos[0] + math.cos(angle + 2.5) * self.size*0.6,
                pos[1] + math.sin(angle + 2.5) * self.size*0.6)
        right= (pos[0] + math.cos(angle - 2.5) * self.size*0.6,
                pos[1] + math.sin(angle - 2.5) * self.size*0.6)
        color = self.color_avoid if self.avoiding else self.color_normal
        arcade.draw_triangle_filled(head[0], head[1], left[0], left[1], right[0], right[1], color)
        # 可选速度方向箭头
        tail = (pos[0] - math.cos(angle) * self.size *0.6,
                pos[1] - math.sin(angle) * self.size *0.6)
        arcade.draw_line(pos[0], pos[1], tail[0], tail[1], arcade.color.GRAY, 2)

# ---- 步骤s-5: 定义障碍物类及存储 ----
class Obstacle:
    def __init__(self, x, y, radius):
        self.position = [x, y]
        self.radius = radius
        self.color = arcade.color.BLUE
    def draw(self):
        arcade.draw_circle_filled(self.position[0], self.position[1], self.radius, self.color)
        arcade.draw_circle_outline(self.position[0], self.position[1], self.radius, arcade.color.BLACK, 2)

# ---- 步骤s-2: Arcade主程序框架 ----
class BoidsApp(arcade.Window):
    def __init__(self, width=960, height=720, title="Boids Flocking Simulation"):
        super().__init__(width, height, title)
        arcade.set_background_color(arcade.color.WHEAT)
        self.width = width
        self.height = height
        self.boids = []  # 鸟群列表
        self.obstacles = [] # 障碍物列表
        # 参数权重
        self.weights = {
            'separation': 1.0,
            'alignment': 0.9,
            'cohesion': 1.0,
            'avoid': 3.2 # 避障大于其它规则
        }
        # 动态交互
        self.show_instructions = True
    # ---- 步骤s-6: 初始化Boid和障碍物 ----
    def setup(self):
        self.boids.clear()
        self.obstacles.clear()
        # 随机生成鸟群
        for _ in range(34):
            x = random.uniform(60, self.width-60)
            y = random.uniform(60, self.height-60)
            self.boids.append(Boid(x, y))
        # 随机生成障碍物
        for _ in range(6):
            while True:
                x = random.uniform(80, self.width-80)
                y = random.uniform(80, self.height-80)
                radius = random.uniform(25, 60)
                # 简单防止障碍和Boid过近
                if all(vec_length(vec_sub([x,y], boid.position)) > radius+30 for boid in self.boids):
                    self.obstacles.append(Obstacle(x, y, radius))
                    break

    # ---- 步骤s-11/15: 绘制障碍物和Boid ----
    def on_draw(self):
        arcade.start_render()
        # 绘制障碍物
        for obs in self.obstacles:
            obs.draw()
        # 绘制Boid
        for boid in self.boids:
            boid.draw()
        # 交互提示
        if self.show_instructions:
            arcade.draw_text(
                "[R]重置  [O]障碍  [B]添加Boid   [+/-]分离 {}/对齐 {}/凝聚 {}/避障 {}".format(
                    self.weights['separation'], self.weights['alignment'], self.weights['cohesion'], self.weights['avoid']),
                20, self.height-30, arcade.color.DARK_GRAY, 13)

    # ---- 步骤s-18: 更新Boid行为和全局状态 ----
    def on_update(self, delta_time):
        # 更新每只Boid
        for boid in self.boids:
            boid.apply_behavior(self.boids, self.obstacles, self.weights)
        for boid in self.boids:
            boid.update(self.width, self.height)
        # ---- 步骤s-16: Boid与障碍物交互动态展示已在draw中高亮 ----
        # ---- 步骤s-17: 可交互调整参数与添加 ----
    def on_key_press(self, key, modifiers):
        if key == arcade.key.R:
            self.setup()
        elif key == arcade.key.O:
            # 添加随机障碍物
            x = random.uniform(60, self.width-60)
            y = random.uniform(60, self.height-60)
            radius = random.uniform(25, 60)
            self.obstacles.append(Obstacle(x, y, radius))
        elif key == arcade.key.B:
            x = random.uniform(40, self.width-40)
            y = random.uniform(40, self.height-40)
            self.boids.append(Boid(x, y))
        elif key == arcade.key.PLUS or key == arcade.key.EQUAL:
            self.weights['separation'] += 0.2
        elif key == arcade.key.MINUS:
            self.weights['separation'] = max(0, self.weights['separation'] - 0.2)
        elif key == arcade.key.A:
            self.weights['alignment'] += 0.2
        elif key == arcade.key.Z:
            self.weights['alignment'] = max(0, self.weights['alignment'] - 0.2)
        elif key == arcade.key.C:
            self.weights['cohesion'] += 0.2
        elif key == arcade.key.X:
            self.weights['cohesion'] = max(0, self.weights['cohesion'] - 0.2)
        elif key == arcade.key.V:
            self.weights['avoid'] += 0.2
        elif key == arcade.key.BACKSPACE:
            self.weights['avoid'] = max(0, self.weights['avoid'] - 0.2)
        elif key == arcade.key.H:
            self.show_instructions = not self.show_instructions

# ---- 步骤s-19: 启动主程序 ----
def main():
    app = BoidsApp()
    app.setup()
    arcade.run()

if __name__ == "__main__":
    main()
