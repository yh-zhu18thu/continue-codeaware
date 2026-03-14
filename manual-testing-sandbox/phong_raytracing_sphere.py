import numpy as np
from PIL import Image

# 1. 定义球体和光源参数
sphere = {
    'center': np.array([0.0, 0.0, 0.0]),
    'radius': 1.0,
    'color': np.array([200, 30, 30]),  # 球体颜色 (RGB)
    'ambient': 0.1,                    # 环境光系数
    'diffuse': 0.6,                    # 漫反射系数
    'specular': 0.3,                   # 高光系数
    'shininess': 32                    # 镜面反射参数
}
light = {
    'position': np.array([5.0, 5.0, -10.0]),
    'intensity': np.array([1.0, 1.0, 1.0])  # 白光强度
}

# 2. 设置摄像机视口与投影面
width, height = 400, 400
viewport_height = 2.0   # 投影面高度（世界坐标单位）
viewport_width = 2.0 * (width / height)  # 投影面宽度，根据画布比例
cam_position = np.array([0.0, 0.0, -3.5])

# 用于颜色裁剪
def clamp(x, min_val=0, max_val=255):
    return int(max(min_val, min(x, max_val)))

# 3. 生成像素点视线射线
img = Image.new("RGB", (width, height))
pixels = img.load()
for j in range(height):
    for i in range(width):
        # 计算投影面单位化坐标 (u,v) ∈ [-1, 1]
        u = (i + 0.5) / width * viewport_width - viewport_width / 2.0
        v = -(j + 0.5) / height * viewport_height + viewport_height / 2.0

        # 投影面在z=0
        pixel_pos = np.array([u, v, 0.0])
        ray_origin = cam_position
        ray_dir = pixel_pos - cam_position
        ray_dir = ray_dir / np.linalg.norm(ray_dir)

        # 4. 计算射线与球面的交点
        oc = ray_origin - sphere['center']
        a = np.dot(ray_dir, ray_dir)
        b = 2.0 * np.dot(oc, ray_dir)
        c = np.dot(oc, oc) - sphere['radius'] ** 2
        discriminant = b * b - 4 * a * c

        if discriminant < 0:
            color = (0, 0, 0)
        else:
            # 取最近交点
            t1 = (-b - np.sqrt(discriminant)) / (2 * a)
            t2 = (-b + np.sqrt(discriminant)) / (2 * a)
            t = min(t1, t2)
            if t < 0:
                t = max(t1, t2)
            if t < 0:
                color = (0, 0, 0)
            else:
                # 交点位置、法线
                hit_point = ray_origin + t * ray_dir
                normal = hit_point - sphere['center']
                normal = normal / np.linalg.norm(normal)

                # 5. 计算Phong模型三种光照分量
                view_dir = -ray_dir
                light_dir = light['position'] - hit_point
                light_dir = light_dir / np.linalg.norm(light_dir)
                reflect_dir = 2 * np.dot(light_dir, normal) * normal - light_dir
                reflect_dir = reflect_dir / np.linalg.norm(reflect_dir)

                # 环境光
                ambient = sphere['ambient'] * light['intensity']
                # 漫反射
                diff = max(np.dot(normal, light_dir), 0.0)
                diffuse = sphere['diffuse'] * diff * light['intensity']
                # 高光
                spec = max(np.dot(reflect_dir, view_dir), 0.0) ** sphere['shininess']
                specular = sphere['specular'] * spec * light['intensity']
                color_val = ambient + diffuse + specular
                object_color = sphere['color'] / 255.0
                shaded_color = color_val * object_color

                color = tuple(clamp(int(x*255)) for x in shaded_color)
        # 6. 生成最终像素颜色并成像
        pixels[i, j] = color

img.save("phong_sphere.png")
print("渲染完成，输出为 phong_sphere.png")
