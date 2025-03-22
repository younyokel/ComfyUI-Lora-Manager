# ComfyUI Workflow Parser

本模块提供了一个灵活的解析系统，可以从ComfyUI工作流中提取生成参数和LoRA信息。

## 设计理念

工作流解析器基于以下设计原则：

1. **模块化**: 每种节点类型由独立的mapper处理
2. **可扩展性**: 通过扩展系统轻松添加新的节点类型支持
3. **回溯**: 通过工作流图的模型输入路径跟踪LoRA节点
4. **灵活性**: 适应不同的ComfyUI工作流结构

## 主要组件

### 1. NodeMapper

`NodeMapper`是所有节点映射器的基类，定义了如何从工作流中提取节点信息:

```python
class NodeMapper:
    def __init__(self, node_type: str, inputs_to_track: List[str]):
        self.node_type = node_type
        self.inputs_to_track = inputs_to_track
    
    def process(self, node_id: str, node_data: Dict, workflow: Dict, parser) -> Any:
        # 处理节点的通用逻辑
        ...
    
    def transform(self, inputs: Dict) -> Any:
        # 由子类覆盖以提供特定转换
        return inputs
```

### 2. WorkflowParser

主要解析类，通过跟踪工作流图来提取参数:

```python
parser = WorkflowParser()
result = parser.parse_workflow("workflow.json")
```

### 3. 扩展系统

允许通过添加新的自定义mapper来扩展支持的节点类型:

```python
# 在py/workflow/ext/中添加自定义mapper模块
load_extensions()  # 自动加载所有扩展
```

## 使用方法

### 基本用法

```python
from workflow.parser import parse_workflow

# 解析工作流并保存结果
result = parse_workflow("workflow.json", "output.json")
```

### 自定义解析

```python
from workflow.parser import WorkflowParser
from workflow.mappers import register_mapper, load_extensions

# 加载扩展
load_extensions()

# 创建解析器
parser = WorkflowParser(load_extensions_on_init=False)  # 不自动加载扩展

# 解析工作流
result = parser.parse_workflow(workflow_data)
```

## 扩展系统

### 添加新的节点映射器

在`py/workflow/ext/`目录中创建Python文件，定义从`NodeMapper`继承的类:

```python
# example_mapper.py
from ..mappers import NodeMapper

class MyCustomNodeMapper(NodeMapper):
    def __init__(self):
        super().__init__(
            node_type="MyCustomNode",  # 节点的class_type
            inputs_to_track=["param1", "param2"]  # 要提取的参数
        )
    
    def transform(self, inputs: Dict) -> Any:
        # 处理提取的参数
        return {
            "custom_param": inputs.get("param1", "default")
        }
```

扩展系统会自动加载和注册这些映射器。

### LoraManager节点说明

LoraManager相关节点的处理方式:

1. **Lora Loader**: 处理`loras`数组，过滤出`active=true`的条目，和`lora_stack`输入
2. **Lora Stacker**: 处理`loras`数组和已有的`lora_stack`，构建叠加的LoRA
3. **TriggerWord Toggle**: 从`toggle_trigger_words`中提取`active=true`的条目

## 输出格式

解析器生成的输出格式如下:

```json
{
    "gen_params": {
        "prompt": "...",
        "negative_prompt": "",
        "steps": "25",
        "sampler": "dpmpp_2m",
        "scheduler": "beta",
        "cfg": "1",
        "seed": "48",
        "guidance": 3.5,
        "size": "896x1152",
        "clip_skip": "2"
    },
    "loras": "<lora:name1:0.9> <lora:name2:0.8>"
}
```

## 高级用法

### 直接注册映射器

```python
from workflow.mappers import register_mapper
from workflow.mappers import NodeMapper

# 创建自定义映射器
class CustomMapper(NodeMapper):
    # ...实现映射器

# 注册映射器
register_mapper(CustomMapper()) 