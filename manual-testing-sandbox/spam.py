#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SVM垃圾邮件分类器 - 纯脚本版本
使用SVM算法对邮件文本进行垃圾邮件分类
"""

import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.svm import SVC
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
from sklearn.pipeline import Pipeline
import re
import string

# 检查是否安装了必要的库
try:
    import pandas as pd
    import sklearn
    print("开始运行SVM垃圾邮件分类器...")
    print("=" * 50)
except ImportError as e:
    print("错误: 缺少必要的库")
    print("请运行以下命令安装所需库:")
    print("pip install pandas scikit-learn numpy")
    print(f"具体错误: {e}")
    exit(1)

# 数据文件路径
data_file = "src/spam.csv"

try:
    # 1. 读取垃圾邮件数据集
    print("正在加载数据集...")
    data = pd.read_csv(data_file)
    print(f"数据集大小: {data.shape}")
    print(f"垃圾邮件数量: {sum(data['label'] == 'spam')}")
    print(f"正常邮件数量: {sum(data['label'] == 'ham')}")
    
    # 2. 文本预处理
    print("正在预处理文本数据...")
    processed_texts = []
    for text in data['text']:
        # 转换为小写
        text = text.lower()
        # 移除标点符号
        text = text.translate(str.maketrans('', '', string.punctuation))
        # 移除数字
        text = re.sub(r'\d+', '', text)
        # 移除多余的空格
        text = ' '.join(text.split())
        processed_texts.append(text)
    
    data['processed_text'] = processed_texts
    
    # 3. 准备特征和标签
    X = data['processed_text']
    y = data['label']
    
    # 4. 划分训练集和测试集
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.3, random_state=42, stratify=y
    )
    
    print(f"训练集大小: {len(X_train)}")
    print(f"测试集大小: {len(X_test)}")
    
    # 5. 构建SVM分类器管道
    print("正在构建SVM分类器...")
    svm_pipeline = Pipeline([
        ('tfidf', TfidfVectorizer(
            max_features=5000,  # 最多使用5000个特征
            stop_words='english',  # 移除英文停用词
            ngram_range=(1, 2),  # 使用1-gram和2-gram
            lowercase=True
        )),
        ('svm', SVC(
            kernel='rbf',  # 使用RBF核函数
            C=1.0,  # 正则化参数
            gamma='scale',  # 核函数参数
            random_state=42
        ))
    ])
    
    # 6. 训练SVM分类器
    print("正在训练SVM分类器...")
    svm_pipeline.fit(X_train, y_train)
    
    # 7. 在测试集上进行预测
    print("正在进行预测...")
    y_pred = svm_pipeline.predict(X_test)
    
    # 8. 评估分类效果
    print("\n=== 分类效果评估 ===")
    accuracy = accuracy_score(y_test, y_pred)
    print(f"准确率: {accuracy:.4f}")
    
    print("\n混淆矩阵:")
    cm = confusion_matrix(y_test, y_pred)
    print(cm)
    
    print("\n详细分类报告:")
    print(classification_report(y_test, y_pred))
    
    # 9. 测试新邮件的分类效果
    print("\n=== 测试新邮件分类 ===")
    
    test_emails = [
        "Congratulations! You have won a million dollars! Click here now!",
        "Can we schedule a meeting for next week?",
        "FREE MONEY! No questions asked! Act now!",
        "Please find the attached report for your review",
        "Your account will be suspended unless you verify immediately!",
        "Thank you for your email. I will get back to you soon."
    ]
    
    for i, email in enumerate(test_emails, 1):
        # 预处理邮件文本
        processed_email = email.lower()
        processed_email = processed_email.translate(str.maketrans('', '', string.punctuation))
        processed_email = re.sub(r'\d+', '', processed_email)
        processed_email = ' '.join(processed_email.split())
        
        prediction = svm_pipeline.predict([processed_email])[0]
        confidence = svm_pipeline.decision_function([processed_email])[0]
        
        print(f"\n邮件 {i}: {email}")
        print(f"预测结果: {'垃圾邮件' if prediction == 'spam' else '正常邮件'}")
        print(f"置信度: {abs(confidence):.4f}")
    
    # 10. 总结
    print(f"\n=== 总结 ===")
    print(f"SVM垃圾邮件分类器训练完成")
    print(f"最终准确率: {accuracy:.4f}")
    print("分类器可以有效识别垃圾邮件和正常邮件")
    
except FileNotFoundError:
    print(f"错误: 找不到数据文件 {data_file}")
    print("请确保数据文件存在于正确的路径")
except Exception as e:
    print(f"运行过程中出现错误: {str(e)}")
