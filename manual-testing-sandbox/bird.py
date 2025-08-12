import arcade  # 导入Arcade库用于可视化与窗口管理
import math     # 导入math标准库，用于数学计算
import random   # 导入random标准库，用于随机数生成
from collections import deque  # 可选，后续如果需要高效的队列操作

# 定义一些常量，方便后续维护和魔法数字消除
SCREEN_WIDTH = 800
SCREEN_HEIGHT = 600
SCREEN_TITLE = "Boids 群鸟模拟 - 动态可视化"
BACKGROUND_COLOR = arcade.color.WHITE
FPS = 60

# ------ 群行为参数 ------
SEPARATION_RADIUS = 26.0  # 分离感知半径
ALIGNMENT_RADIUS  = 55.0  # 对齐感知半径
COHESION_RADIUS   = 55.0  # 凝聚感知半径
SEPARATION_FORCE  = 0.09  # 分离力权重
ALIGNMENT_FORCE   = 0.05  # 对齐力权重
COHESION_FORCE    = 0.035 # 凝聚力权重

# ---------------- 新增代码部分 ----------------
class Boid:
    """
    表示一只Boid（鸟），拥有位置、速度、加速度等属性。
    便于后续实现各种行为和状态。
    """
    def __init__(self, position, velocity):
        self.position = arcade.Vector(position[0], position[1])  # 位置(x, y)
        self.velocity = arcade.Vector(velocity[0], velocity[1])  # 速度(x, y)
        self.acceleration = arcade.Vector(0, 0)                  # 加速度(x, y)
        self.radius = 6  # 绘制半径，可根据实际调整

    def update(self):
        """
        更新Boid的位置和速度，并进行边界处理，使其不会飞出屏幕。
        """
        # 更新速度和位置
        self.velocity += self.acceleration
        # 限制最大速度
        max_speed = 4.0
        if self.velocity.length > max_speed:
            self.velocity = self.velocity.normalize() * max_speed
        self.position += self.velocity
        # 清空加速度（每帧由行为重新累加）
        self.acceleration = arcade.Vector(0, 0)
        # 边界环绕处理（使Boid从一侧出去会从另一侧进来）
        if self.position.x < 0:
            self.position.x += SCREEN_WIDTH
        if self.position.x >= SCREEN_WIDTH:
            self.position.x -= SCREEN_WIDTH
        if self.position.y < 0:
            self.position.y += SCREEN_HEIGHT
        if self.position.y >= SCREEN_HEIGHT:
            self.position.y -= SCREEN_HEIGHT

    # 添加Boid的行为（仅供主程序调用）
    def apply_force(self, force):
        """
        对Boid累加一个力（向量），用于行为作用。
        """
        self.acceleration += force

    def separation(self, neighbors):
        """
        分离规则：避免与邻居距离过近。
        neighbors: 在感知半径内的其它Boid列表。
        返回分离力（Vector）。
        """
        steer = arcade.Vector(0.0, 0.0)
        total = 0
        for other in neighbors:
            distance = (self.position - other.position).length
            if 0 < distance < SEPARATION_RADIUS:
                # 朝远离对方的方向施加力, 距离越近，力越大
                diff = (self.position - other.position)
                if diff.length > 0:
                    diff = diff.normalize()
                steer += diff / max(distance, 0.01)  # 距离分之一加权
                total += 1
        if total > 0:
            steer /= total
        if steer.length > 0:
            # 转换为期望最大速度，然后减去自身速度
            steer = steer.normalize() * 4.0 - self.velocity
            # 限制最大分离力
            max_force = 0.35
            if steer.length > max_force:
                steer = steer.normalize() * max_force
        return steer * SEPARATION_FORCE

    def alignment(self, neighbors):
        """
        对齐规则：趋向于与邻近Boid的平均方向一致（速度对齐）。
        neighbors: 在感知半径内的其它Boid列表。
        返回对齐力（Vector）。
        """
        if not neighbors:
            return arcade.Vector(0.0, 0.0)
        avg_vel = arcade.Vector(0.0, 0.0)
        total = 0
        for other in neighbors:
            avg_vel += other.velocity
            total += 1
        avg_vel /= total
        if avg_vel.length > 0:
            avg_vel = avg_vel.normalize() * 4.0
            steer = avg_vel - self.velocity
            max_force = 0.12
            if steer.length > max_force:
                steer = steer.normalize() * max_force
            return steer * ALIGNMENT_FORCE
        return arcade.Vector(0.0, 0.0)

    def cohesion(self, neighbors):
        """
        凝聚规则：趋向于邻居群的中心。
        neighbors: 在感知半径内的其它Boid列表。
        返回凝聚力（Vector）。
        """
        if not neighbors:
            return arcade.Vector(0.0, 0.0)
        center = arcade.Vector(0.0, 0.0)
        total = 0
        for other in neighbors:
            center += other.position
            total += 1
        center /= total
        # 指向邻居中心方向的向量
        to_center = center - self.position
        if to_center.length > 0:
            to_center = to_center.normalize() * 4.0
            steer = to_center - self.velocity
            max_force = 0.1
            if steer.length > max_force:
                steer = steer.normalize() * max_force
            return steer * COHESION_FORCE
        return arcade.Vector(0.0, 0.0)

class Obstacle:
    """
    表示一个静态障碍物，拥有位置和半径。
    """
    def __init__(self, position, radius):
        self.position = arcade.Vector(position[0], position[1])  # 位置(x, y)
        self.radius = radius                                     # 障碍物半径

# ---------------- 主应用程序部分 ----------------
class BoidsApp(arcade.Window):
    """
    主应用程序类，继承自arcade.Window。
    负责窗口的生命周期管理、绘制和更新。
    """
    def __init__(self, width, height, title):
        # 初始化父类（Arcade窗口）
        super().__init__(width, height, title)
        # 设置背景色
        arcade.set_background_color(BACKGROUND_COLOR)
        # 初始化boids和障碍物的数据结构
        self.boids = []            # Boid对象列表
        self.obstacles = []        # 障碍物对象列表

    def setup(self):
        """
        初始化或重置游戏的状态，在游戏开始或重置时调用。
        初始化一组Boid和若干障碍物实例，并随机分布。
        """
        self.boids = []
        self.obstacles = []
        # 随机生成boids
        num_boids = 30
        for _ in range(num_boids):
            pos = (
                random.uniform(0, SCREEN_WIDTH),
                random.uniform(0, SCREEN_HEIGHT)
            )
            angle = random.uniform(0, 2 * math.pi)
            speed = random.uniform(1.0, 3.5)
            vel = (math.cos(angle)*speed, math.sin(angle)*speed)
            boid = Boid(pos, vel)
            self.boids.append(boid)
        # 随机生成障碍物
        num_obstacles = 5
        for _ in range(num_obstacles):
            # 为避免障碍物太靠边，可以设定一定边距
            margin = 40
            pos = (
                random.uniform(margin, SCREEN_WIDTH - margin),
                random.uniform(margin, SCREEN_HEIGHT - margin)
            )
            radius = random.uniform(25, 45)
            obstacle = Obstacle(pos, radius)
            self.obstacles.append(obstacle)

    def on_draw(self):
        """
        每帧绘制回调，负责渲染内容。
        绘制Boid和障碍物。
        """
        arcade.start_render()
        # 绘制障碍物
        for obstacle in self.obstacles:
            arcade.draw_circle_filled(
                obstacle.position.x, obstacle.position.y,
                obstacle.radius, arcade.color.GRAY)
        # 绘制boids
        for boid in self.boids:
            # 画三角形代表鸟的朝向
            direction = boid.velocity.normalize() if boid.velocity.length > 0 else arcade.Vector(1, 0)
            perp = arcade.Vector(-direction.y, direction.x)
            tip = boid.position + direction * (boid.radius * 2.3)
            left = boid.position + perp * boid.radius * 0.8 - direction * boid.radius * 0.8
            right = boid.position - perp * boid.radius * 0.8 - direction * boid.radius * 0.8
            arcade.draw_triangle_filled(tip.x, tip.y, left.x, left.y, right.x, right.y, arcade.color.BLUE)
            # 可选：画圆辅助视野
            # arcade.draw_circle_outline(boid.position.x, boid.position.y, boid.radius, arcade.color.BLUE, 1)

    def on_update(self, delta_time):
        """
        每帧刷新回调，负责逻辑更新。
        新增实现：
        1. 计算每只Boid的邻居列表（分离、对齐、凝聚三组邻居可分别设定不同半径）；
        2. 对每只Boid分别叠加三则群行为产生的加速度。
        """
        # 为避免重复，为每只boid预计算邻居（为效率可用空间分区/哈希，但此处暴力遍历）
        boids_count = len(self.boids)
        for i in range(boids_count):
            boid = self.boids[i]
            separation_neighbors = []
            alignment_neighbors = []
            cohesion_neighbors = []
            for j in range(boids_count):
                if i == j:
                    continue
                other = self.boids[j]
                # 环绕距离处理（因为边界环绕，计算最小周期距离）
                dx = abs(boid.position.x - other.position.x)
                if dx > SCREEN_WIDTH / 2:
                    dx = SCREEN_WIDTH - dx
                dy = abs(boid.position.y - other.position.y)
                if dy > SCREEN_HEIGHT / 2:
                    dy = SCREEN_HEIGHT - dy
                distance = math.hypot(dx, dy)
                # 给每一个规则收集独立的邻居
                if distance < SEPARATION_RADIUS:
                    separation_neighbors.append(other)
                if distance < ALIGNMENT_RADIUS:
                    alignment_neighbors.append(other)
                if distance < COHESION_RADIUS:
                    cohesion_neighbors.append(other)
            # 分离力
            sep = boid.separation(separation_neighbors)
            # 对齐力
            ali = boid.alignment(alignment_neighbors)
            # 凝聚力
            coh = boid.cohesion(cohesion_neighbors)
            # 应用总力
            boid.apply_force(sep)
            boid.apply_force(ali)
            boid.apply_force(coh)
        # 更新运动学
        for boid in self.boids:
            boid.update()  # 更新每只Boid的位置

if __name__ == "__main__":
    # 创建应用实例并运行
    app = BoidsApp(SCREEN_WIDTH, SCREEN_HEIGHT, SCREEN_TITLE)
    app.setup()
    arcade.run()
