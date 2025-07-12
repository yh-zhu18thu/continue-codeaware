import pandas as pd

data = pd.read_csv("src/spam.csv")
# 检查数据的基本信息和缺失值情况，以便了解数据集的结构和质量

print(data.info())
# 检查是否存在缺失值，并统计每列的缺失值数量

missing_values = data.isnull().sum()
data.dropna(inplace=True)
# 将邮件文本和标签分开，准备特征和目标变量
X = data['text']  # 假设邮件文本列名为'text'

y = data['label']  # 假设垃圾邮件标签列名为'label'
# 将文本数据转化为特征向量，使用TF-IDF方法

from sklearn.feature_extraction.text import TfidfVectorizer

vectorizer = TfidfVectorizer(stop_words='english', max_features=5000)
X_transformed = vectorizer.fit_transform(X)
from sklearn.model_selection import train_test_split
X_train, X_test, y_train, y_test = train_test_split(X_transformed, y, test_size=0.2, random_state=42)

# 使用支持向量机（SVM）分类器进行训练和测试
from sklearn.svm import SVC
clf = SVC(kernel='linear', random_state=42)
# 训练分类器并进行预测
clf.fit(X_train, y_train)
# 检查数据的基本信息和缺失值情况，以便了解数据集的结构和质量



















