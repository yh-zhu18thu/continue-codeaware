# 导入Tkinter包，这是Python标准的GUI库。
import tkinter
from tkinter import messagebox

# 创建主窗口对象，作为计算器的主界面
root = tkinter.Tk()

# 设置窗口标题，让用户识别程序
root.title("整数计算器")

# 优化窗口大小及布局（步骤s-12）：设置窗口大小适合计算器控件排列
root.resizable(False, False)  # 禁止拉伸窗口
root.geometry("370x400")  # 设置适合按钮与显示框的窗口大小
root.configure(bg="#f4f4f4")  # 背景色美化

# 创建输入显示框，用于显示输入和表达式
entry = tkinter.Entry(root, font=("Arial", 26, "bold"), justify="right", bd=4, relief="ridge")
entry.grid(row=0, column=0, columnspan=4, padx=15, pady=20, ipady=17, sticky="nsew")
entry.configure(bg="#fff")  # 美化显示框背景色

# 收集用户输入的表达式（步骤s-8）
expression = ""

# 按钮点击后的处理（步骤s-7, s-8, s-9, s-10, s-11）
def on_button_click(value):
    global expression
    if value == "=":
        # 当点击等号按钮时，解析并计算表达式（s-9），只允许整数运算
        try:
            # 利用eval实现整数表达式计算
            # 若表达式包含非法字符则提示错误
            # 只允许数字和+ - * /
            if not expression or not all(c.isdigit() or c in '+-*/' for c in expression):
                raise ValueError
            result = eval(expression)
            # 只显示整数结果（s-10）
            if isinstance(result, float):
                # 若结果为小数，向下取整
                result = int(result)
            entry.delete(0, tkinter.END)
            entry.insert(0, str(result))
            expression = str(result)
        except ZeroDivisionError:
            entry.delete(0, tkinter.END)
            entry.insert(0, "错误: 除零")
            expression = ""
        except Exception:
            entry.delete(0, tkinter.END)
            entry.insert(0, "无效输入")
            expression = ""
    else:
        # 收集并显示用户输入的表达式（s-8）
        # 只允许输入数字或者四则运算符
        if value in '0123456789+-*/':
            # 限制表达式长度，防止过长
            if len(expression) < 20:
                expression += value
                entry.delete(0, tkinter.END)
                entry.insert(0, expression)
            else:
                messagebox.showinfo("提示", "表达式长度已达上限")
        # 不处理其他（避免意外）

# 定义按钮的布局信息
buttons = [
    ('7', 1, 0), ('8', 1, 1), ('9', 1, 2), ('+', 1, 3),
    ('4', 2, 0), ('5', 2, 1), ('6', 2, 2), ('-', 2, 3),
    ('1', 3, 0), ('2', 3, 1), ('3', 3, 2), ('*', 3, 3),
    ('0', 4, 0), ('/', 4, 1), ('=', 4, 2)
]

# 创建并布局数字、运算符和等号按钮（美化s-13）
for (text, row, col) in buttons:
    # 等号按钮美化为蓝色，其他为浅灰色
    if text == '=':
        btn = tkinter.Button(root, text=text, font=("Arial", 22, "bold"), width=4, height=2,
                            fg="#fff", bg="#3498db", activebackground="#2980b9",
                            command=lambda val=text: on_button_click(val), relief="raised", bd=4)
    else:
        btn = tkinter.Button(root, text=text, font=("Arial", 20), width=4, height=2,
                            fg="#333", bg="#ecf0f1", activebackground="#bdc3c7",
                            command=lambda val=text: on_button_click(val), relief="groove", bd=3)
    btn.grid(row=row, column=col, padx=7, pady=7, sticky="nsew")

# 创建并布局清除（C）按钮
# 美化清除按钮（红色突出）
def clear_entry():
    global expression
    entry.delete(0, tkinter.END)
    expression = ""  # 清空表达式

c_btn = tkinter.Button(root, text='C', font=("Arial", 20, "bold"), width=4, height=2,
                      fg="#fff", bg="#e74c3c", activebackground="#c0392b",
                      command=clear_entry, relief="raised", bd=4)
c_btn.grid(row=4, column=3, padx=7, pady=7, sticky="nsew")

# 优化每个按钮与显示框的Grid布局权重（让控件自动拉伸填充单元格）
for i in range(5):
    root.grid_rowconfigure(i, weight=1)
for j in range(4):
    root.grid_columnconfigure(j, weight=1)

# 启动主事件循环，显示窗口（步骤s-14）
root.mainloop()
