# 导入所需的包和库
import math  # 进行数学运算，比如开方、三角函数等
import numpy as np  # 用于向量、矩阵处理
from PIL import Image  # 用于输出和保存图片

# 声明三维向量类
class Vector:
    def __init__(self, x=0.0, y=0.0, z=0.0):
        self.x = float(x)
        self.y = float(y)
        self.z = float(z)

    def __add__(self, other):
        return Vector(self.x + other.x, self.y + other.y, self.z + other.z)

    def __sub__(self, other):
        return Vector(self.x - other.x, self.y - other.y, self.z - other.z)

    def __mul__(self, scalar):
        return Vector(self.x * scalar, self.y * scalar, self.z * scalar)

    def __rmul__(self, scalar):
        return self.__mul__(scalar)

    def dot(self, other):
        return self.x * other.x + self.y * other.y + self.z * other.z

    def cross(self, other):
        return Vector(
            self.y * other.z - self.z * other.y,
            self.z * other.x - self.x * other.z,
            self.x * other.y - self.y * other.x
        )

    def length(self):
        return math.sqrt(self.x ** 2 + self.y ** 2 + self.z ** 2)

    def normalize(self):
        len = self.length()
        if len == 0:
            return Vector(0, 0, 0)
        return Vector(self.x / len, self.y / len, self.z / len)

    def to_list(self):
        return [self.x, self.y, self.z]

# 声明光线类
class Ray:
    def __init__(self, origin, direction):
        self.origin = origin  # Vector类型，起点
        self.direction = direction.normalize()  # Vector类型，方向

# 声明球体类（用于场景物体或墙体）
class Sphere:
    def __init__(self, center, radius, color, reflect=0.0, refract=0.0, ior=1.0):
        self.center = center  # Vector类型，中心位置
        self.radius = radius  # 浮点数，半径
        self.color = color  # Vector类型，颜色 (RGB)
        self.reflect = reflect  # 反射系数，默认为0
        self.refract = refract  # 折射系数，默认为0
        self.ior = ior  # 介质折射率，默认为1.0

# 声明光源类
class Light:
    def __init__(self, center, emission):
        self.center = center  # Vector类型，光源位置
        self.emission = emission  # Vector类型，发光强度 (RGB)

# 声明相机类
class Camera:
    def __init__(self, pos, look, up, fov):
        self.pos = pos  # Vector类型，摄像机位置
        self.look = look  # Vector类型，朝向目标点
        self.up = up  # Vector类型，上方向
        self.fov = fov  # 浮点数，视场角（度）

# 代码到此处只实现了导入库和声明数据结构，后续可扩展用于解析场景、渲染等