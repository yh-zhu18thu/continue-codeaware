import tkinter as tk

# Step 1: 创建主窗口和显示框
root = tk.Tk()
root.title("简易计算器")
root.geometry("300x400")  # 设置窗口大小

# 创建显示框，用于显示输入和结果
display_var = tk.StringVar()  # 用于动态改变显示内容
display_entry = tk.Entry(root, textvariable=display_var, font=('Arial', 24), bd=10, relief=tk.RIDGE, justify='right')
display_entry.grid(row=0, column=0, columnspan=4, padx=10, pady=20, sticky="we")

# 程序主循环
root.mainloop()
