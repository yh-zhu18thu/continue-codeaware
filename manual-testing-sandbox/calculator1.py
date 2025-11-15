# 导入Tkinter包（步骤 s-1）
import tkinter as tk

# 创建主窗口（步骤 s-2）
root = tk.Tk()

# 设置窗口标题与尺寸（步骤 s-3）
root.title("整数计算器")  # 设定窗口标题
root.geometry("400x400")  # 设置为正方形窗口

# 添加输入和显示区域（步骤 s-4）
# 使用Entry控件来显示输入内容和结果
entry_var = tk.StringVar()  # 变量用于保存输入/结果
entry = tk.Entry(root, textvariable=entry_var, font=("Arial", 24), justify="right", state="readonly", width=15)
entry.grid(row=0, column=0, columnspan=4, pady=20)

# 布局数字和运算符按钮（步骤 s-5）
# 定义按钮标签和对应位置
button_config = [
    {"text": "7", "row": 1, "col": 0},
    {"text": "8", "row": 1, "col": 1},
    {"text": "9", "row": 1, "col": 2},
    {"text": "+", "row": 1, "col": 3},
    {"text": "4", "row": 2, "col": 0},
    {"text": "5", "row": 2, "col": 1},
    {"text": "6", "row": 2, "col": 2},
    {"text": "-", "row": 2, "col": 3},
    {"text": "1", "row": 3, "col": 0},
    {"text": "2", "row": 3, "col": 1},
    {"text": "3", "row": 3, "col": 2},
    {"text": "×", "row": 3, "col": 3},
    {"text": "0", "row": 4, "col": 0},
    {"text": "清除", "row": 4, "col": 1},
    {"text": "=", "row": 4, "col": 2},
    {"text": "÷", "row": 4, "col": 3},
]

buttons = []
for conf in button_config:
    btn = tk.Button(root, text=conf["text"], font=("Arial", 20), width=5, height=2)
    btn.grid(row=conf["row"], column=conf["col"], padx=5, pady=5)
    buttons.append(btn)

# 定义按钮点击事件函数（步骤 s-6）
# 临时存储输入表达式的全局变量
exp = ""

# 按钮点击事件处理函数
def on_button_click(key):
    global exp
    if key == "清除":
        exp = ""
        entry_var.set("")
    elif key == "=":
        calculate()
    else:
        # 运算符转换为对应Python表达式符号
        if key == "×":
            exp += "*"
        elif key == "÷":
            exp += "/"
        else:
            exp += key
        entry_var.set(exp)

# 绑定各按钮的事件
for idx, conf in enumerate(button_config):
    key = conf["text"]
    buttons[idx]["command"] = lambda k=key: on_button_click(k)

# 实现等号功能与整数计算（步骤 s-7）
def calculate():
    global exp
    try:
        # 只允许合法表达式出现数字（整数）和基本运算符
        filtered_exp = ""
        for c in exp:
            if c in "0123456789+-*/":
                filtered_exp += c
        # 利用eval安全地计算表达式，整数运算
        result = eval(filtered_exp)
        # 只显示整数结果
        result = int(result)
        entry_var.set(str(result))
        exp = str(result)
    except Exception:
        entry_var.set("错误")
        exp = ""

# 启动主循环，显示窗口
root.mainloop()
