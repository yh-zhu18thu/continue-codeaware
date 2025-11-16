# Import necessary packages
import pandas as pd  # For data handling
from sklearn.model_selection import train_test_split  # For train/test split
from sklearn.feature_extraction.text import TfidfVectorizer  # For TF-IDF
from sklearn.svm import SVC  # For SVM classifier
from sklearn.metrics import confusion_matrix, ConfusionMatrixDisplay  # For confusion matrix
import matplotlib.pyplot as plt  # For plotting

# Load the spam message dataset
# Assumes 'spam.csv' is in the current directory
# It has columns: 'v1' (label: 'spam'/'ham'), 'v2' (message text), possibly more
print("Loading dataset...")
df = pd.read_csv('spam.csv', encoding='latin-1')

# Select relevant columns and check for missing values
# Keep only 'v1' and 'v2'
df = df[['v1', 'v2']]
# Drop rows with any missing values, if present
df = df.dropna()

# Convert text labels to numerical values: 'spam'->1, 'ham'->0
df['label'] = df['v1'].map({'ham': 0, 'spam': 1})
X = df['v2']  # Message text
y = df['label']  # Numerical labels

# Split dataset into training and testing sets (80% train, 20% test)
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# Transform message texts into numerical features using TF-IDF
vectorizer = TfidfVectorizer()
X_train_tfidf = vectorizer.fit_transform(X_train)
X_test_tfidf = vectorizer.transform(X_test)

# Train an SVM classifier on the training data
svm_clf = SVC(kernel='linear', random_state=42)
svm_clf.fit(X_train_tfidf, y_train)

# Predict spam/ham labels on the test data
y_pred = svm_clf.predict(X_test_tfidf)

# Compute and display the confusion matrix
cm = confusion_matrix(y_test, y_pred, labels=[0, 1])
disp = ConfusionMatrixDisplay(confusion_matrix=cm, display_labels=['Ham', 'Spam'])
print("\nConfusion Matrix:")
disp.plot(cmap=plt.cm.Blues)
plt.show()
